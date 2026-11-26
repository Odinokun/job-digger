import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  prepareCareerSource,
  type PreparedCareerSource,
} from "../../lib/companies/career-source.ts";
import {
  absoluteCompanyUrl,
  normalizeCompanyUrl,
  type UrlRefusalReason,
} from "../../lib/companies/url.ts";
import { careerSources, companies } from "../db/schema.ts";
import {
  findCompanyUrlConflict,
  type ConflictingCompany,
} from "./duplicates.ts";
import { withPagePlatform, type PagePlatforms } from "./page-platform.ts";
import {
  findCompanyWithSource,
  type CompanyWithSource,
} from "./source-duplicates.ts";

/** What the user changed in the Edit modal. */
export type UpdateCompanyInput = {
  userId: string;
  companyId: string;
  /** The new company name. */
  name: string;
  /**
   * The main site from the modal field. Required, as in Add company (task
   * company-site-required). `undefined` means the site does not change.
   */
  url?: string;
  /** Sources marked for deletion. The change applies on Save. */
  removeSourceIds?: string[];
  /**
   * Labels of existing sources: source id → the label from the field. An empty
   * label means "remove the label", not "leave it": the form sends every field.
   */
  sourceLabels?: Record<string, string>;
  /**
   * A new career page entered by hand. Until there was automatic search
   * (task 5.07), this was the only way to give a company a second source - for
   * example, three filters of one mozilla.org page (card 2.16).
   */
  addSource?: { url: string; label?: string };
  /** Platforms recognised by page content (`platformsByPage`, task 5.13). */
  pagePlatforms?: PagePlatforms;
};

/**
 * How editing ended.
 *
 * `not-found` covers both a missing company and someone else's: the answer is
 * the same, because otherwise it would hint that such a row exists in the database.
 */
export type UpdateCompanyResult =
  | { ok: true }
  | { ok: false; problem: "name-required" }
  | { ok: false; problem: "not-found" }
  /** The site is empty or unusable - as in `addCompany`. */
  | { ok: false; problem: "company-url"; reason: UrlRefusalReason }
  /** Another company of the user already has this site. */
  | { ok: false; problem: "already-added"; company: ConflictingCompany }
  | { ok: false; problem: "source-url"; reason: UrlRefusalReason }
  | { ok: false; problem: "source-duplicate" }
  /**
   * This source already belongs to another company of the same user. Apart from
   * `source-duplicate`: there the page is already in this very company and
   * visible in the list above, while here we have to name who has it (card 2.17).
   */
  | { ok: false; problem: "source-taken"; company: CompanyWithSource };

/**
 * Renames the company, relabels and deletes its career sources, and adds a new one.
 *
 * All in one transaction: otherwise a broken name could leave sources already
 * deleted. Vacancies of a deleted source, favorites included, go with it:
 * `vacancies.source_id` is `on delete cascade` (`server/db/schema.ts`).
 *
 * The new source's address is checked **before** the transaction, as in
 * `addCompany`: a refusal then does not do half the work - no rename, no deletions.
 */
export async function updateCompany(
  db: NodePgDatabase,
  {
    userId,
    companyId,
    name,
    url,
    removeSourceIds = [],
    sourceLabels = {},
    addSource,
    pagePlatforms,
  }: UpdateCompanyInput,
): Promise<UpdateCompanyResult> {
  const trimmedName = name.trim();

  if (trimmedName === "") {
    return { ok: false, problem: "name-required" };
  }

  // The site is checked before the transaction, like the new source: a refusal
  // does not do half the work. An exact match with another company's site is a
  // refusal; the company's own unchanged site is not a conflict. "Same domain"
  // gives no warning here: this edits an existing company, not a new card.
  let site: { url: string; normalizedUrl: string } | null = null;

  if (url !== undefined) {
    const normalized = normalizeCompanyUrl(url);

    if (!normalized.ok) {
      return { ok: false, problem: "company-url", reason: normalized.reason };
    }

    const conflict = await findCompanyUrlConflict(db, {
      userId,
      normalizedUrl: normalized.url,
    });

    if (conflict.kind === "exact" && conflict.company.id !== companyId) {
      return { ok: false, problem: "already-added", company: conflict.company };
    }

    site = {
      url: absoluteCompanyUrl(url.trim()),
      normalizedUrl: normalized.url,
    };
  }

  let newSource: PreparedCareerSource | null = null;

  if (addSource) {
    const prepared = prepareCareerSource({
      url: addSource.url,
      label: addSource.label,
      existingUrls: await keptSourceUrls(db, {
        userId,
        companyId,
        removeSourceIds,
      }),
    });

    if (!prepared.ok) {
      return prepared.problem === "url"
        ? { ok: false, problem: "source-url", reason: prepared.reason }
        : { ok: false, problem: "source-duplicate" };
    }

    newSource = withPagePlatform(prepared, pagePlatforms);
  }

  return db.transaction(async (tx) => {
    // The name is updated with a condition on the user, and that condition also
    // checks access: someone else's row will not update and returns nothing.
    const [updated] = await tx
      .update(companies)
      .set(
        site === null ? { name: trimmedName } : { name: trimmedName, ...site },
      )
      .where(and(eq(companies.id, companyId), eq(companies.userId, userId)))
      .returning({ id: companies.id });

    if (!updated) {
      return { ok: false, problem: "not-found" };
    }

    if (removeSourceIds.length > 0) {
      // The condition on `companyId` is required: source ids come from the
      // client, so without it a source of another company could be deleted.
      await tx
        .delete(careerSources)
        .where(
          and(
            eq(careerSources.companyId, companyId),
            inArray(careerSources.id, removeSourceIds),
          ),
        );
    }

    // Labels of existing sources. There are as many queries as fields in the
    // modal: a company has only a few sources, so one `UPDATE ... CASE` is not
    // worth it. `company_id` in the condition is required - ids come from the client.
    for (const [sourceId, label] of Object.entries(sourceLabels)) {
      const trimmed = label.trim();

      await tx
        .update(careerSources)
        .set({ label: trimmed === "" ? null : trimmed })
        .where(
          and(
            eq(careerSources.companyId, companyId),
            eq(careerSources.id, sourceId),
          ),
        );
    }

    if (newSource) {
      const taken = await findCompanyWithSource(tx, {
        userId,
        normalizedUrl: newSource.normalizedUrl,
        exceptCompanyId: companyId,
      });

      if (taken) {
        return { ok: false, problem: "source-taken", company: taken };
      }

      await tx.insert(careerSources).values({
        companyId,
        url: newSource.url,
        normalizedUrl: newSource.normalizedUrl,
        label: newSource.label,
        platform: newSource.platform,
        isTracked: newSource.isTracked,
      });
    }

    const left = await tx
      .select({ id: careerSources.id })
      .from(careerSources)
      .where(eq(careerSources.companyId, companyId))
      .limit(1);

    // Without sources the company ends up in Not tracked, and the previous search
    // status no longer describes it: "not checked" is truer than "not found"
    // (card 2.05).
    if (left.length === 0) {
      await tx
        .update(companies)
        .set({ discoveryStatus: "not_checked" })
        .where(eq(companies.id, companyId));
    }

    return { ok: true };
  });
}

/**
 * The source addresses the company must keep after this Save.
 *
 * Those marked for deletion are left out: otherwise replacing an address with
 * the same one would run into a source that will be gone after Save.
 *
 * The query goes through `companies` with a condition on the user: without it
 * the answer "such a source already exists" would tell about someone else's company.
 */
async function keptSourceUrls(
  db: NodePgDatabase,
  {
    userId,
    companyId,
    removeSourceIds,
  }: { userId: string; companyId: string; removeSourceIds: string[] },
): Promise<string[]> {
  const rows = await db
    .select({ id: careerSources.id, url: careerSources.url })
    .from(careerSources)
    .innerJoin(companies, eq(careerSources.companyId, companies.id))
    .where(and(eq(companies.id, companyId), eq(companies.userId, userId)));

  return rows
    .filter((row) => !removeSourceIds.includes(row.id))
    .map((row) => row.url);
}
