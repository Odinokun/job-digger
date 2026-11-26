/**
 * Export CSV: which rows go into the file (task 6.05).
 */
import { and, asc, eq, exists, inArray, notExists } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { careerSources, companies } from "../db/schema.ts";
import type { CsvRow } from "./format.ts";

export interface ExportOptions {
  userId: string;
  /** Companies from the Tracked tab. */
  tracked: boolean;
  /** Companies without tracked sources. */
  notTracked: boolean;
  /**
   * Include career page URLs: a row per source, including the ones we do not
   * read. Without it - a row per company with empty `career_url` and
   * `career_label`.
   */
  careerUrls: boolean;
}

/**
 * The file rows in the order of the company list (by name, then `id`), a
 * company's sources in the order they were added, as on the card.
 */
export async function exportCompanyRows(
  db: NodePgDatabase,
  { userId, tracked, notTracked, careerUrls }: ExportOptions,
): Promise<CsvRow[]> {
  if (!tracked && !notTracked) {
    return [];
  }

  // The same rule that splits the tabs: Tracked means a source with `is_tracked`.
  const trackedSource = db
    .select({ id: careerSources.id })
    .from(careerSources)
    .where(
      and(
        eq(careerSources.companyId, companies.id),
        eq(careerSources.isTracked, true),
      ),
    );

  const rows = await db
    .select({ id: companies.id, name: companies.name, url: companies.url })
    .from(companies)
    .where(
      and(
        eq(companies.userId, userId),
        tracked && notTracked
          ? undefined
          : tracked
            ? exists(trackedSource)
            : notExists(trackedSource),
      ),
    )
    .orderBy(asc(companies.name), asc(companies.id));

  const sources =
    careerUrls && rows.length > 0
      ? await db
          .select({
            companyId: careerSources.companyId,
            url: careerSources.url,
            label: careerSources.label,
          })
          .from(careerSources)
          .where(
            inArray(
              careerSources.companyId,
              rows.map((row) => row.id),
            ),
          )
          .orderBy(asc(careerSources.createdAt), asc(careerSources.id))
      : [];

  const byCompany = Map.groupBy(sources, (source) => source.companyId);

  return rows.flatMap((company) => {
    const base = { company_name: company.name, company_url: company.url };
    const own = byCompany.get(company.id) ?? [];

    return own.length === 0
      ? [{ ...base, career_url: "", career_label: "" }]
      : own.map((source) => ({
          ...base,
          career_url: source.url,
          career_label: source.label ?? "",
        }));
  });
}
