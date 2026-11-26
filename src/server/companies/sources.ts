import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  prepareCareerSource,
  type PreparedCareerSource,
} from "../../lib/companies/career-source.ts";
import type { UrlRefusalReason } from "../../lib/companies/url.ts";
import { careerSources, companies } from "../db/schema.ts";
import { withPagePlatform, type PagePlatforms } from "./page-platform.ts";
import {
  findCompanyWithSource,
  type CompanyWithSource,
} from "./source-duplicates.ts";

/** Which source is added to which company. */
export type AddCareerSourceInput = {
  userId: string;
  companyId: string;
  url: string;
  label?: string;
  /** Platforms recognised by page content (`platformsByPage`, task 5.13). */
  pagePlatforms?: PagePlatforms;
};

/**
 * How adding a source ended.
 *
 * The refusals are named as in `updateCompany`: the modals show the same texts,
 * and two sets of names for one action would drift apart.
 */
export type AddCareerSourceResult =
  | { ok: true }
  | { ok: false; problem: "not-found" }
  | { ok: false; problem: "source-url"; reason: UrlRefusalReason }
  | { ok: false; problem: "source-duplicate" }
  /**
   * This source already belongs to another company of the same user. Apart from
   * `source-duplicate`: there the page is already in this very company and
   * visible in the list above, while here we have to name who has it (card 2.17).
   */
  | { ok: false; problem: "source-taken"; company: CompanyWithSource };

/**
 * Adds a career source to a company that has already been added.
 *
 * Needed where the company is not being edited: the Add company modal, having
 * recognised the pasted address as an already added company, offers to save
 * this address as one more source instead of a flat refusal (card 2.16). Editing
 * a company does the same with its own Save - there the source is added in one
 * transaction with the rename and the deletions (`update.ts`).
 *
 * Everything is in a transaction, because the access check and the insert are
 * two queries: otherwise the company could be deleted between them, and the
 * source would be left without it.
 */
export async function addCareerSource(
  db: NodePgDatabase,
  { userId, companyId, url, label, pagePlatforms }: AddCareerSourceInput,
): Promise<AddCareerSourceResult> {
  return addCareerSources(db, {
    userId,
    companyId,
    sources: [{ url, label }],
    pagePlatforms,
  });
}

/** Which sources are added to which company in one Save. */
export type AddCareerSourcesInput = {
  userId: string;
  companyId: string;
  sources: Array<{ url: string; label?: string }>;
  /** Platforms recognised by page content (`platformsByPage`, task 5.13). */
  pagePlatforms?: PagePlatforms;
};

/**
 * Adds several career sources to a company that has already been added - the
 * Find pages findings chosen on a Not tracked card (task 5.14).
 *
 * All or nothing: all addresses are checked first, and only then inserted. An
 * early `return` from a Drizzle transaction is a commit, not a rollback, so an
 * insert in the middle of the checks would leave half of the sources added.
 *
 * The same page written twice is one source, as among the findings in
 * `addCompany`. A page the company already has, however, is a
 * `source-duplicate` refusal.
 */
export async function addCareerSources(
  db: NodePgDatabase,
  { userId, companyId, sources, pagePlatforms }: AddCareerSourcesInput,
): Promise<AddCareerSourceResult> {
  return db.transaction(async (tx) => {
    const [company] = await tx
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.id, companyId), eq(companies.userId, userId)));

    // The answer is the same for a missing company and someone else's: otherwise
    // it would hint that such a row exists in the database.
    if (!company) {
      return { ok: false, problem: "not-found" };
    }

    const existingUrls = (await companySources(tx, companyId)).map(
      (source) => source.url,
    );
    const ready = new Map<string, PreparedCareerSource>();

    for (const source of sources) {
      const checked = prepareCareerSource({ ...source, existingUrls });

      if (!checked.ok) {
        return checked.problem === "url"
          ? { ok: false, problem: "source-url", reason: checked.reason }
          : { ok: false, problem: "source-duplicate" };
      }

      const prepared = withPagePlatform(checked, pagePlatforms);

      if (ready.has(prepared.normalizedUrl)) {
        continue;
      }

      const taken = await findCompanyWithSource(tx, {
        userId,
        normalizedUrl: prepared.normalizedUrl,
        exceptCompanyId: companyId,
      });

      if (taken) {
        return { ok: false, problem: "source-taken", company: taken };
      }

      ready.set(prepared.normalizedUrl, prepared);
    }

    if (ready.size > 0) {
      await tx.insert(careerSources).values(
        [...ready.values()].map((prepared) => ({
          companyId,
          url: prepared.url,
          normalizedUrl: prepared.normalizedUrl,
          label: prepared.label,
          platform: prepared.platform,
          isTracked: prepared.isTracked,
        })),
      );
    }

    return { ok: true };
  });
}

/**
 * The company's sources - id and address.
 *
 * Access is not checked here: callers first make sure the company belongs to the
 * user (`addCareerSource` with a separate query, `updateCompany` with a
 * condition of the `UPDATE` itself).
 */
export async function companySources(
  db: NodePgDatabase,
  companyId: string,
): Promise<Array<{ id: string; url: string }>> {
  return db
    .select({ id: careerSources.id, url: careerSources.url })
    .from(careerSources)
    .where(eq(careerSources.companyId, companyId));
}
