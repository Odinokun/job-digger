"use server";

import { runAction } from "@/app/action-result";
import { revalidateHeaderCounts } from "@/app/components/header-counts";
import {
  parseCompaniesTab,
  type CompanyListItem,
} from "@/lib/companies/company-list";
import { absoluteCompanyUrl, normalizeCompanyUrl } from "@/lib/companies/url";
import type { Cursor } from "@/lib/pagination/cursor";
import { startCheckAll } from "@/server/checks/check-all";
import { getCheckStatus } from "@/server/checks/check-status";
import { checkCompany } from "@/server/checks/check-company";
import { startFindNewPages } from "@/server/checks/find-new-pages";
import { addCompany } from "@/server/companies/add";
import { deleteCompany } from "@/server/companies/delete";
import { findCompanyInTab, listCompanies } from "@/server/companies/list";
import { platformsByPage } from "@/server/companies/page-platform";
import { addCareerSource, addCareerSources } from "@/server/companies/sources";
import {
  applyOwnPageRecipe,
  previewOwnPage,
  type OwnPagePreview,
} from "@/server/companies/own-page";
import { setSourceReferenceOnly } from "@/server/companies/reference-only";
import { findCompaniesWithSources } from "@/server/companies/source-duplicates";
import { updateCompany } from "@/server/companies/update";
import { discoverSources } from "@/server/discovery/discover";
import { getDb } from "@/server/db/client";
import { getSystemUser } from "@/server/db/system-user";
import { httpClient } from "@/server/http/http-client";
import { setCompanyVacanciesRead } from "@/server/vacancies/marks";

import type {
  AddCareerSourceFormState,
  AddCompanyFormState,
  CheckCompanyNowResult,
  DeleteCompanyFormState,
  EditCompanyFormState,
  FindPagesResult,
  LoadMoreCompaniesResult,
  StartCheckAllResult,
  StartFindNewPagesResult,
} from "./form-state";

/**
 * Server Action wrapper around `addCompany`.
 *
 * It decides nothing itself: it reads the form fields, takes the user and hands
 * the work to the server module. The form is sent from the client, so the
 * fields here are untrusted input, and `addCompany` checks them.
 */
export async function addCompanyAction(
  _state: AddCompanyFormState,
  formData: FormData,
): Promise<AddCompanyFormState> {
  const tab = parseCompaniesTab(formData.get("tab"));

  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    const careerUrl = readField(formData, "careerUrl");
    // Chosen Find pages findings: the list checkboxes with `name="foundUrl"`.
    const foundUrls = formData
      .getAll("foundUrl")
      .filter((value): value is string => typeof value === "string");

    const result = await addCompany(db, {
      userId: user.id,
      name: readField(formData, "name"),
      url: readField(formData, "url"),
      careerUrl,
      foundUrls,
      pagePlatforms: await platformsByPage(
        [careerUrl, ...foundUrls],
        httpClient,
      ),
      // The flag appears in the form only after a warning - about the domain or
      // about the same name. One for both: the user confirms the decision
      // "add it anyway", not each check separately.
      confirmed: formData.get("confirmed") === "true",
    });

    if (!result.ok) {
      return result;
    }

    // The row for the list: without it the client would have to re-read the
    // page, and the loaded batches with it.
    const company = await findCompanyInTab(db, {
      userId: user.id,
      companyId: result.companyId,
      tab,
    });

    // A company on Tracked has tracked sources and is checked right away
    // (src/app/README.md, "Adding a company").
    const isTracked =
      tab === "tracked"
        ? company !== null
        : (await findCompanyInTab(db, {
            userId: user.id,
            companyId: result.companyId,
            tab: "tracked",
          })) !== null;

    return {
      ok: true as const,
      company,
      firstCheck: isTracked ? result.companyId : null,
    };
  });

  if (!outcome.ok) {
    return { status: "failed-unexpectedly" };
  }

  const result = outcome.value;

  if (!result.ok) {
    return { status: "failed", result };
  }

  // The list inserts the row itself, while the server renders the tab and header counters.
  revalidateHeaderCounts();

  return {
    status: "added",
    company: result.company,
    firstCheck: result.firstCheck,
  };
}

/**
 * Find pages in the Add company modal: a search for career sources by site and
 * name (`discoverSources`, src/server/discovery/README.md).
 *
 * It changes nothing - it only reads other sites - but it is a Server Action
 * because the search goes to the network from the server. The arguments are
 * untrusted input, so the address is checked here: a bad one gets the same
 * refusal as Save.
 *
 * `companyId` is a search for an existing company (Find pages on a Not tracked
 * card, task 5.14): its own sources are already on the card, so they are removed
 * from the findings. The id is untrusted input, but it only filters findings:
 * companies are looked up among the user's own companies.
 */
export async function findPagesAction(
  url: unknown,
  name: unknown,
  companyId?: unknown,
): Promise<FindPagesResult> {
  const typedUrl = typeof url === "string" ? url.trim() : "";
  const typedName = typeof name === "string" ? name.trim() : "";

  if (typedUrl === "" && typedName === "") {
    return { ok: false, problem: "address-required" };
  }

  let siteUrl: string | null = null;
  if (typedUrl !== "") {
    const normalized = normalizeCompanyUrl(typedUrl);
    if (!normalized.ok) {
      return { ok: false, problem: "company-url", reason: normalized.reason };
    }
    siteUrl = absoluteCompanyUrl(typedUrl);
  }

  const outcome = await runAction(async () => {
    const findings = await discoverSources(
      { siteUrl, name: typedName },
      httpClient,
    );
    const db = getDb();
    const user = await getSystemUser(db);
    const tracked = await findCompaniesWithSources(db, {
      userId: user.id,
      urls: findings.map((finding) => finding.url),
    });

    return findings
      .map((finding) => ({
        ...finding,
        trackedIn: tracked.get(finding.url) ?? null,
      }))
      .filter(
        (finding) =>
          finding.trackedIn === null || finding.trackedIn.id !== companyId,
      );
  });

  return outcome.ok
    ? { ok: true, findings: outcome.value }
    : { ok: false, problem: "failed-unexpectedly" };
}

/** A form field as a string: `FormData` also returns files, which cannot be here. */
function readField(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

/**
 * A name search from an untrusted argument: not a string - no search. The rest
 * (trimming, escaping `%` and `_`) is done by `listCompanies`.
 */
function searchQuery(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * The next 50 companies after the cursor.
 *
 * The arguments come from the client and are not protected by anything: a
 * Server Action can be reached with a direct POST request, not only through the
 * button (Next docs, "Server Functions are reachable via direct POST
 * requests"). So the tab, the cursor and the search are parsed here, and the
 * user is taken on the server - it is never passed from the client.
 */
export async function loadMoreCompaniesAction(
  tab: unknown,
  after: unknown,
  query: unknown,
): Promise<LoadMoreCompaniesResult> {
  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    return listCompanies(db, {
      userId: user.id,
      tab: parseCompaniesTab(tab),
      query: searchQuery(query),
      // `listCompanies` cleans `after` itself through `parseCursor`.
      after: after as Cursor | null,
    });
  });

  if (!outcome.ok) {
    return { ok: false };
  }

  return { ok: true, ...outcome.value };
}

/** No more rows than this in one re-read - a guard against a bogus number. */
const MAX_RELOAD = 500;

/**
 * Re-reads as many companies from the start as are already shown, after a
 * general check ends: statuses and "Last checked" have changed, and the list
 * rows live in client state. How many are shown is an untrusted number, so it
 * is capped.
 */
export async function reloadCompaniesAction(
  tab: unknown,
  shown: unknown,
  query: unknown,
): Promise<LoadMoreCompaniesResult> {
  const limit =
    typeof shown === "number" && Number.isInteger(shown) && shown > 0
      ? Math.min(shown, MAX_RELOAD)
      : undefined;

  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    return listCompanies(db, {
      userId: user.id,
      tab: parseCompaniesTab(tab),
      query: searchQuery(query),
      limit,
    });
  });

  return outcome.ok ? { ok: true, ...outcome.value } : { ok: false };
}

/**
 * Check now for one company: checks its sources and returns the updated list
 * row.
 *
 * The arguments are untrusted input, as in `loadMoreCompaniesAction`: the
 * company is looked up by the user from the server, so someone else's cannot be
 * checked. The action waits until all the sources are read. During a general
 * check it refuses with `check-running`: the company is being checked anyway.
 */
export async function checkCompanyNowAction(
  companyId: unknown,
  tab: unknown,
): Promise<CheckCompanyNowResult> {
  if (typeof companyId !== "string") {
    return { ok: false };
  }

  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    const checked = await checkCompany(db, httpClient, {
      userId: user.id,
      companyId,
      checkedAt: new Date(),
    });

    if (!checked.ok && checked.reason === "check-running") {
      return "check-running" as const;
    }

    // `not-found` - the company is gone, and `null` removes its row.
    return checked.ok
      ? findCompanyInTab(db, {
          userId: user.id,
          companyId,
          tab: parseCompaniesTab(tab),
        })
      : null;
  });

  if (!outcome.ok) {
    return { ok: false };
  }

  if (outcome.value === "check-running") {
    return { ok: false, reason: "check-running" };
  }

  // A check adds and removes vacancies - the unread counter in the header.
  revalidateHeaderCounts();

  return { ok: true, company: outcome.value };
}

/**
 * Check all from the Tracked tab (src/server/checks/README.md): queues every
 * tracked source and returns at once - the queue loop checks the sources, and
 * the UI is not blocked.
 */
export async function startCheckAllAction(): Promise<StartCheckAllResult> {
  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    // A manual Check all reads only the first page of each source (task 6.16).
    const started = await startCheckAll(db, {
      userId: user.id,
      depthMode: "first-page",
      now: new Date(),
    });

    return started.ok
      ? {
          ok: true as const,
          total: started.total,
          status: await getCheckStatus(db, { userId: user.id }),
        }
      : started;
  });

  if (!outcome.ok) {
    return { ok: false, reason: "unexpected" };
  }

  return outcome.value;
}

/**
 * Find new pages on the Not tracked tab: queues a search for each of its
 * companies (`startFindNewPages`) and returns the state for polling, like Check
 * all.
 */
export async function startFindNewPagesAction(): Promise<StartFindNewPagesResult> {
  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    const started = await startFindNewPages(db, {
      userId: user.id,
      now: new Date(),
    });

    return started.ok
      ? {
          ok: true as const,
          total: started.total,
          status: await getCheckStatus(db, { userId: user.id }),
        }
      : started;
  });

  if (!outcome.ok) {
    return { ok: false, reason: "unexpected" };
  }

  return outcome.value;
}

/**
 * Server Action wrapper around `updateCompany`.
 *
 * The form fields are untrusted input, so the company and source ids go to
 * `updateCompany` as they are: there the query conditions check them (the
 * company by user, the sources by company) instead of trusting the client.
 */
export async function updateCompanyAction(
  _state: EditCompanyFormState,
  formData: FormData,
): Promise<EditCompanyFormState> {
  const companyId = readField(formData, "companyId");
  const tab = parseCompaniesTab(formData.get("tab"));

  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    const addSource = addedSource(formData);
    const result = await updateCompany(db, {
      userId: user.id,
      companyId,
      name: readField(formData, "name"),
      url: readField(formData, "url"),
      removeSourceIds: formData
        .getAll("removeSourceIds")
        .filter((value): value is string => typeof value === "string"),
      sourceLabels: typedLabels(formData),
      // An empty address field means "no source added", not a bad address: the
      // same approach as with the career page in the Add company modal.
      addSource,
      pagePlatforms: await platformsByPage(
        addSource === undefined ? [] : [addSource.url],
        httpClient,
      ),
    });

    if (!result.ok) {
      return result;
    }

    // The same row the list now sees: without it the client would have to
    // either re-read every loaded batch or guess the result.
    return {
      ok: true as const,
      company: await findCompanyInTab(db, { userId: user.id, companyId, tab }),
    };
  });

  if (!outcome.ok) {
    return { status: "failed-unexpectedly" };
  }

  const result = outcome.value;

  if (!result.ok) {
    return { status: "failed", result };
  }

  // The list updates the row itself, but the server renders the tab counters:
  // a company without sources moves between Tracked and Not tracked. A removed
  // source takes its vacancies along - hence the unread counter in the header.
  revalidateHeaderCounts();

  return { status: "saved", company: result.company };
}

/**
 * Server Action wrapper around `deleteCompany`.
 *
 * Unlike Edit, there is no tab here: after deletion there is no row to re-read,
 * the list simply removes it. The company id is untrusted input; the query in
 * `deleteCompany` checks the rights to it.
 */
export async function deleteCompanyAction(
  _state: DeleteCompanyFormState,
  formData: FormData,
): Promise<DeleteCompanyFormState> {
  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    return deleteCompany(db, {
      userId: user.id,
      companyId: readField(formData, "companyId"),
    });
  });

  if (!outcome.ok) {
    return { status: "failed-unexpectedly" };
  }

  const result = outcome.value;

  if (!result.ok) {
    return { status: "failed", result };
  }

  // The list removes the row itself, while the server renders the tab counters.
  // The company's vacancies go with it - hence the unread counter in the header.
  revalidateHeaderCounts();

  return { status: "deleted" };
}

/**
 * Adds the pasted address as a career page of an existing company.
 *
 * It is called not from the form but by a button in the Add company modal, when
 * the address matched an existing company (task 2.16). The arguments come from
 * the client and are not protected by anything - a Server Action can be reached
 * with a direct POST request - so here they are reduced to strings, and
 * `addCareerSource` checks the rights to the company with its own query.
 */
export async function addCareerSourceAction(
  companyId: unknown,
  url: unknown,
  label: unknown,
  tab: unknown,
): Promise<AddCareerSourceFormState> {
  const company = asString(companyId);
  const currentTab = parseCompaniesTab(tab);

  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    const result = await addCareerSource(db, {
      userId: user.id,
      companyId: company,
      url: asString(url),
      label: asString(label),
      pagePlatforms: await platformsByPage([asString(url)], httpClient),
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true as const,
      company: await findCompanyInTab(db, {
        userId: user.id,
        companyId: company,
        tab: currentTab,
      }),
    };
  });

  if (!outcome.ok) {
    return { status: "failed-unexpectedly" };
  }

  const result = outcome.value;

  if (!result.ok) {
    return { status: "failed", result };
  }

  // The list replaces the row itself, while the server renders the tab and
  // header counters: with a new source the company moves from Not tracked to Tracked.
  revalidateHeaderCounts();

  return { status: "added", companyId: company, company: result.company };
}

/**
 * Adds the chosen Find pages findings as sources of an existing company - the
 * Find pages modal on a Not tracked card (task 5.14).
 *
 * The arguments are untrusted input: the addresses are reduced to strings, and
 * `addCareerSources` checks the rights to the company and the addresses
 * themselves. The first check after Save is the client's job, as after Add
 * company (5.09).
 */
export async function addFoundPagesAction(
  companyId: unknown,
  urls: unknown,
  tab: unknown,
): Promise<AddCareerSourceFormState> {
  const company = asString(companyId);
  const currentTab = parseCompaniesTab(tab);
  const picked = Array.isArray(urls)
    ? urls.filter((url): url is string => typeof url === "string")
    : [];

  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    const result = await addCareerSources(db, {
      userId: user.id,
      companyId: company,
      sources: picked.map((url) => ({ url })),
      pagePlatforms: await platformsByPage(picked, httpClient),
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true as const,
      company: await findCompanyInTab(db, {
        userId: user.id,
        companyId: company,
        tab: currentTab,
      }),
    };
  });

  if (!outcome.ok) {
    return { status: "failed-unexpectedly" };
  }

  const result = outcome.value;

  if (!result.ok) {
    return { status: "failed", result };
  }

  // The server renders the tab and header counters: with a readable source the
  // company moves from Not tracked to Tracked.
  revalidateHeaderCounts();

  return { status: "added", companyId: company, company: result.company };
}

/** A Server Action argument as a string: anything can arrive from the client. */
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Prefix of the source label fields: the source id follows in the name. */
const SOURCE_LABEL_PREFIX = "sourceLabel.";

/**
 * Labels of existing sources from the form fields: source id - the label typed.
 *
 * The field name carries the id (`sourceLabel.<id>`) instead of a separate
 * parallel array of ids: `FormData` does not guarantee that two arrays arrive
 * with the same length, and a label could end up on someone else's source. The
 * ids themselves are untrusted input, so the query in `updateCompany` checks them.
 */
function typedLabels(formData: FormData): Record<string, string> {
  const labels: Record<string, string> = {};

  for (const [field, value] of formData.entries()) {
    if (field.startsWith(SOURCE_LABEL_PREFIX) && typeof value === "string") {
      labels[field.slice(SOURCE_LABEL_PREFIX.length)] = value;
    }
  }

  return labels;
}

/** The new career source from the Edit modal fields, or `undefined` if none was entered. */
function addedSource(
  formData: FormData,
): { url: string; label?: string } | undefined {
  const url = readField(formData, "addSourceUrl").trim();

  return url === ""
    ? undefined
    : { url, label: readField(formData, "addSourceLabel") };
}

/**
 * Mark all as read / Mark all as unread for a company.
 * The arguments are untrusted input: `setCompanyVacanciesRead` checks the id
 * (UUID and owner), and the mark must be a boolean. `revalidateHeaderCounts` is
 * there for the header counter and so that Jobs, opened right after the action,
 * does not show the list from before the write (task 3.22).
 */
export async function setCompanyVacanciesReadAction(
  companyId: unknown,
  isRead: unknown,
): Promise<{ ok: true; changed: number } | { ok: false }> {
  if (typeof companyId !== "string" || typeof isRead !== "boolean") {
    return { ok: false };
  }

  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    return setCompanyVacanciesRead(db, { userId: user.id, companyId, isRead });
  });

  if (!outcome.ok) {
    return { ok: false };
  }

  revalidateHeaderCounts();

  return { ok: true, changed: outcome.value };
}

/**
 * The "link only" mark on an Unsupported page (task 6.17).
 *
 * The arguments are untrusted input: `setSourceReferenceOnly` checks the id and
 * the owner, `parseCompaniesTab` the tab. The response is the company row as the
 * tab now sees it: on Needs attention a marked company may leave the tab, then
 * `company: null`. `revalidateHeaderCounts` is there for the number next to
 * Companies in the header and for the tab counter.
 */
export async function setSourceReferenceOnlyAction(
  companyId: unknown,
  sourceId: unknown,
  referenceOnly: unknown,
  tab: unknown,
): Promise<{ ok: true; company: CompanyListItem | null } | { ok: false }> {
  if (
    typeof companyId !== "string" ||
    typeof sourceId !== "string" ||
    typeof referenceOnly !== "boolean"
  ) {
    return { ok: false };
  }

  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);
    const result = await setSourceReferenceOnly(db, {
      userId: user.id,
      sourceId,
      referenceOnly,
    });

    if (!result.ok) {
      return null;
    }

    return {
      company: await findCompanyInTab(db, {
        userId: user.id,
        companyId,
        tab: parseCompaniesTab(tab),
      }),
    };
  });

  if (!outcome.ok || outcome.value === null) {
    // `null` here is a refusal of the mark, not a company that left the tab:
    // `findCompanyInTab` is called only after success.
    return { ok: false };
  }

  revalidateHeaderCounts();

  return { ok: true, company: outcome.value.company };
}

/**
 * Read as list, step 1 (task 6.21): the link groups of an own page from which
 * the user picks the vacancies. The source id is untrusted input;
 * `previewOwnPage` checks the owner and the platform. `failed` is an unexpected
 * failure.
 */
export async function previewOwnPageAction(
  sourceId: unknown,
): Promise<OwnPagePreview | { ok: false; problem: "failed" }> {
  if (typeof sourceId !== "string") {
    return { ok: false, problem: "not-found" };
  }

  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    return previewOwnPage(db, httpClient, { userId: user.id, sourceId });
  });

  return outcome.ok ? outcome.value : { ok: false, problem: "failed" };
}

/**
 * Read as list, step 2: saves the chosen group as a recipe and returns the
 * company row for the tab - `null` if the company left it (Not tracked becomes
 * Tracked). The client starts the first check, as after Add company.
 */
export async function applyOwnPageRecipeAction(
  companyId: unknown,
  sourceId: unknown,
  prefix: unknown,
  tab: unknown,
): Promise<{ ok: true; company: CompanyListItem | null } | { ok: false }> {
  if (
    typeof companyId !== "string" ||
    typeof sourceId !== "string" ||
    typeof prefix !== "string"
  ) {
    return { ok: false };
  }

  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);
    const applied = await applyOwnPageRecipe(db, {
      userId: user.id,
      sourceId,
      prefix,
    });

    if (!applied.ok) {
      return null;
    }

    return {
      company: await findCompanyInTab(db, {
        userId: user.id,
        companyId,
        tab: parseCompaniesTab(tab),
      }),
    };
  });

  if (!outcome.ok || outcome.value === null) {
    return { ok: false };
  }

  // The page is no longer "not read": the number next to Companies and the tabs.
  revalidateHeaderCounts();

  return { ok: true, company: outcome.value.company };
}
