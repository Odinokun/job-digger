/**
 * Import CSV: the file rows → companies and sources (task 6.06). Parsing the
 * file is `parse.ts`.
 */
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { prepareCareerSource } from "../../lib/companies/career-source.ts";
import {
  absoluteCompanyUrl,
  normalizeCompanyUrl,
} from "../../lib/companies/url.ts";
import { findCompanyUrlConflict } from "../companies/duplicates.ts";
import { findCompanyWithSource } from "../companies/source-duplicates.ts";
import { careerSources, companies } from "../db/schema.ts";
import type { CsvRow } from "./format.ts";

export interface ImportSummary {
  companiesAdded: number;
  sourcesAdded: number;
  /**
   * Skipped: a page this or another company already has, and a row without a
   * page for a company that already exists.
   */
  duplicates: number;
  /** Rows that could not be read: without a name, without a site or with a bad address. */
  errors: number;
}

/** A row that passed the checks. */
interface ValidRow {
  name: string;
  /** The company site - required (task company-site-required). */
  companyUrl: { typed: string; normalized: string };
  careerUrl: string;
  /** The cleaned career page address, or `null` if there is none. */
  careerNormalized: string | null;
  label: string;
}

/**
 * Imports the rows in one transaction.
 *
 * **The same company** is only an exact match of the cleaned site address, as in
 * `addCompany`. A row without a site is an error: the company site is required
 * (task company-site-required). The "same domain" and "same name" warnings do not
 * stop anything here: nobody can confirm them in a file, and different companies
 * do live on one domain.
 *
 * A row with an error is skipped and counted instead of stopping the import. The
 * name of an existing company does not change. A company without sources lands in
 * Not tracked with the status Not checked; no page search runs after the import.
 */
export async function importCompanies(
  db: NodePgDatabase,
  { userId, rows }: { userId: string; rows: CsvRow[] },
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    companiesAdded: 0,
    sourcesAdded: 0,
    duplicates: 0,
    errors: 0,
  };
  // The rows of one company together: the key is the cleaned site.
  const groups = new Map<string, ValidRow[]>();

  for (const row of rows) {
    const valid = validateRow(row);

    if (valid === null) {
      summary.errors += 1;
      continue;
    }

    const key = valid.companyUrl.normalized;
    groups.set(key, [...(groups.get(key) ?? []), valid]);
  }

  await db.transaction(async (tx) => {
    for (const group of groups.values()) {
      const [first] = group;
      let companyId = await findExisting(tx, userId, first);
      // The first row of a new company adds it - even without a page.
      let addedByThisFile = false;

      if (companyId === null) {
        const [created] = await tx
          .insert(companies)
          .values({
            userId,
            name: first.name,
            url: absoluteCompanyUrl(first.companyUrl.typed),
            normalizedUrl: first.companyUrl.normalized,
          })
          .returning({ id: companies.id });
        companyId = created.id;
        summary.companiesAdded += 1;
        addedByThisFile = true;
      }

      for (const [index, row] of group.entries()) {
        const added = await addSource(tx, userId, companyId, row);

        // A duplicate is every page that was not added, and a row without a page
        // if it was not this row that added the company.
        if (added) {
          summary.sourcesAdded += 1;
        } else if (
          row.careerNormalized !== null ||
          !(addedByThisFile && index === 0)
        ) {
          summary.duplicates += 1;
        }
      }
    }
  });

  return summary;
}

/** A row with a usable name and addresses, or `null`. */
function validateRow(row: CsvRow): ValidRow | null {
  const name = row.company_name.trim();
  const typedCompanyUrl = row.company_url.trim();
  const careerUrl = row.career_url.trim();

  if (name === "" || typedCompanyUrl === "") {
    return null;
  }

  const company = normalizeCompanyUrl(typedCompanyUrl);
  const career = careerUrl === "" ? null : normalizeCompanyUrl(careerUrl);

  if (!company.ok || (career !== null && !career.ok)) {
    return null;
  }

  return {
    name,
    companyUrl: { typed: typedCompanyUrl, normalized: company.url },
    careerUrl,
    careerNormalized: career?.url ?? null,
    label: row.career_label,
  };
}

/** The user's existing company for a group of rows, or `null`. */
async function findExisting(
  db: NodePgDatabase,
  userId: string,
  row: ValidRow,
): Promise<string | null> {
  const conflict = await findCompanyUrlConflict(db, {
    userId,
    normalizedUrl: row.companyUrl.normalized,
  });

  return conflict.kind === "exact" ? conflict.company.id : null;
}

/**
 * Adds the row's page to the company. `false` - nothing to add: there is no page,
 * this company already has it, or it belongs to another one.
 */
async function addSource(
  db: NodePgDatabase,
  userId: string,
  companyId: string,
  row: ValidRow,
): Promise<boolean> {
  if (row.careerNormalized === null) {
    return false;
  }

  const existingUrls = (
    await db
      .select({ url: careerSources.url })
      .from(careerSources)
      .where(eq(careerSources.companyId, companyId))
  ).map((source) => source.url);
  const prepared = prepareCareerSource({
    url: row.careerUrl,
    label: row.label,
    existingUrls,
  });

  if (!prepared.ok) {
    return false;
  }

  const taken = await findCompanyWithSource(db, {
    userId,
    normalizedUrl: prepared.normalizedUrl,
    exceptCompanyId: companyId,
  });

  if (taken) {
    return false;
  }

  await db.insert(careerSources).values({
    companyId,
    url: prepared.url,
    normalizedUrl: prepared.normalizedUrl,
    label: prepared.label,
    platform: prepared.platform,
    isTracked: prepared.isTracked,
  });

  return true;
}
