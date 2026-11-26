import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { careerSources, companies } from "../db/schema.ts";
import { withPagePlatform, type PagePlatforms } from "./page-platform.ts";
import {
  findCompanyWithSource,
  type CompanyWithSource,
} from "./source-duplicates.ts";
import {
  findCompaniesByName,
  findCompanyUrlConflict,
  type ConflictingCompany,
  type NamedCompany,
} from "./duplicates.ts";
import { detectPlatform } from "../../lib/companies/platform.ts";
import {
  absoluteCompanyUrl,
  normalizeCompanyUrl,
  type UrlRefusalReason,
} from "../../lib/companies/url.ts";

/** What the user entered in the Add company modal. */
export type AddCompanyInput = {
  userId: string;
  name: string;
  /**
   * The company's main site. Stored with its path. Required (task
   * company-site-required); before that it could be empty (card 2.17).
   */
  url: string;
  /** The career page. Optional: without it the company goes to Not tracked. */
  careerUrl?: string;
  /**
   * The Find pages findings the user chose (src/app/README.md, "Adding a
   * company"). They come from the client, so they are checked the same way as
   * `careerUrl`; the same page in the field and among the findings is one source.
   */
  foundUrls?: string[];
  /**
   * The user has already seen a warning - about other companies on the same
   * domain or about a company with the same name - and pressed Save again.
   *
   * One flag for both warnings: the user confirms the decision "add it anyway",
   * not each check separately. It does not get past an exact address match
   * (`already-added`).
   */
  confirmed?: boolean;
  /** Platforms recognised by page content (`platformsByPage`, task 5.13). */
  pagePlatforms?: PagePlatforms;
};

/**
 * How adding ended.
 *
 * A result object, not exceptions: every refusal here is expected user input
 * that the modal has to show (the same approach as in `normalizeCompanyUrl`).
 * `same-domain` is not an error but a warning: a repeated Save with
 * `sameDomainConfirmed` passes it.
 */
export type AddCompanyResult =
  | { ok: true; companyId: string }
  | { ok: false; problem: "name-required" }
  /**
   * The site is empty (`reason: "empty"`) or unusable. The site is required
   * (task company-site-required): before that a company with only a career page
   * was added without one (card 2.17).
   */
  | { ok: false; problem: "company-url"; reason: UrlRefusalReason }
  | { ok: false; problem: "career-url"; reason: UrlRefusalReason }
  /**
   * This source already belongs to another company of the same user. Apart from
   * `source-duplicate`: there the page is already in this very company and
   * visible in the list above, while here we have to name who has it (card 2.17).
   */
  | { ok: false; problem: "source-taken"; company: CompanyWithSource }
  | { ok: false; problem: "already-added"; company: ConflictingCompany }
  | { ok: false; problem: "same-domain"; companies: ConflictingCompany[] }
  /**
   * A company with the same name already exists. The only signal left when one
   * card has only a site and the other only a career page (card 2.17).
   */
  | { ok: false; problem: "same-name"; companies: NamedCompany[] };

/**
 * Adds a company with its career pages: the one entered by hand and the chosen
 * Find pages findings.
 *
 * Each source's platform is derived from its address with `detectPlatform`, and
 * `discovery_status` stays `not_checked`: search statuses are task 5.11.
 *
 * All input is checked before the first insert, and the company and its source
 * are written in one transaction: otherwise a broken career address would leave
 * a company without a source in the database.
 */
export async function addCompany(
  db: NodePgDatabase,
  {
    userId,
    name,
    url,
    careerUrl,
    foundUrls = [],
    confirmed = false,
    pagePlatforms,
  }: AddCompanyInput,
): Promise<AddCompanyResult> {
  const trimmedName = name.trim();

  if (trimmedName === "") {
    return { ok: false, problem: "name-required" };
  }

  // The site is required: an empty field is an `empty` refusal from
  // `normalizeCompanyUrl` itself, just as `ftp://` is `unsupported-scheme`.
  const typedUrl = url.trim();
  // The career page field goes first: that way its source is first in the list too.
  const typedSources = [careerUrl ?? "", ...foundUrls]
    .map((source) => source.trim())
    .filter((source) => source !== "");

  const normalizedCompanyUrl = normalizeCompanyUrl(typedUrl);

  if (!normalizedCompanyUrl.ok) {
    return {
      ok: false,
      problem: "company-url",
      reason: normalizedCompanyUrl.reason,
    };
  }

  // Sources without repeats by normalized address: the same board in the field
  // and among the findings, written differently, is one source.
  const sources = new Map<string, string>();

  for (const typed of typedSources) {
    const normalized = normalizeCompanyUrl(typed);

    if (!normalized.ok) {
      return { ok: false, problem: "career-url", reason: normalized.reason };
    }

    if (!sources.has(normalized.url)) {
      sources.set(normalized.url, typed);
    }
  }

  const conflict = await findCompanyUrlConflict(db, {
    userId,
    normalizedUrl: normalizedCompanyUrl.url,
  });

  const sameName = confirmed
    ? []
    : await findCompaniesByName(db, { userId, name: trimmedName });

  const companyNormalizedUrl = normalizedCompanyUrl.url;

  if (conflict.kind === "exact") {
    return { ok: false, problem: "already-added", company: conflict.company };
  }

  // The same domain is only a warning: different companies may live on it, for
  // example national versions. The decision stays with the user.
  if (conflict.kind === "same-domain" && !confirmed) {
    return {
      ok: false,
      problem: "same-domain",
      companies: conflict.companies,
    };
  }

  // The weakest signal is checked last: first the exact address match, then the
  // domain, and only then the name.
  if (sameName.length > 0) {
    return { ok: false, problem: "same-name", companies: sameName };
  }

  return db.transaction(async (tx) => {
    for (const normalizedUrl of sources.keys()) {
      // The same page in another company means the company has already been
      // added, possibly under another site (card 2.17).
      const taken = await findCompanyWithSource(tx, { userId, normalizedUrl });

      if (taken) {
        return { ok: false, problem: "source-taken", company: taken };
      }
    }

    const [company] = await tx
      .insert(companies)
      .values({
        userId,
        name: trimmedName,
        url: absoluteCompanyUrl(typedUrl),
        normalizedUrl: companyNormalizedUrl,
      })
      // The check above is friendly but not atomic: between it and this insert
      // another request could add the same company. The unique index
      // `(user_id, normalized_url)` has the last word, so `do nothing` instead of an error.
      .onConflictDoNothing({
        target: [companies.userId, companies.normalizedUrl],
      })
      .returning();

    if (!company) {
      const [existing] = await tx
        .select({ id: companies.id, name: companies.name, url: companies.url })
        .from(companies)
        .where(
          and(
            eq(companies.userId, userId),
            eq(companies.normalizedUrl, companyNormalizedUrl),
          ),
        );

      if (!existing) {
        throw new Error(
          `Company url ${companyNormalizedUrl} conflicted on insert but cannot be found`,
        );
      }

      return {
        ok: false,
        problem: "already-added",
        company: { id: existing.id, name: existing.name, url: existing.url },
      };
    }

    if (sources.size > 0) {
      await tx.insert(careerSources).values(
        [...sources].map(([normalizedUrl, typed]) => {
          const platform = detectPlatform(normalizedUrl);

          return withPagePlatform(
            {
              companyId: company.id,
              url: absoluteCompanyUrl(typed),
              normalizedUrl,
              platform,
              // A page nothing can read is saved without tracking.
              isTracked: platform !== "unsupported",
            },
            pagePlatforms,
          );
        }),
      );
    }

    return { ok: true, companyId: company.id };
  });
}
