/**
 * Export CSV: які рядки потрапляють у файл (docs/ui.md, розділ 10; задача 6.05).
 */
import { and, asc, eq, exists, inArray, notExists } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { careerSources, companies } from "../db/schema.ts";
import type { CsvRow } from "./format.ts";

export interface ExportOptions {
  userId: string;
  /** Компанії з вкладки Tracked. */
  tracked: boolean;
  /** Компанії без джерел, що відстежуються. */
  notTracked: boolean;
  /**
   * Include career page URLs: по рядку на джерело, зокрема ті, що ми не
   * читаємо. Без цього - рядок на компанію з порожніми `career_url` і
   * `career_label`.
   */
  careerUrls: boolean;
}

/**
 * Рядки файлу в порядку списку компаній (за назвою, далі `id`), джерела
 * компанії - у порядку додавання, як у картці.
 */
export async function exportCompanyRows(
  db: NodePgDatabase,
  { userId, tracked, notTracked, careerUrls }: ExportOptions,
): Promise<CsvRow[]> {
  if (!tracked && !notTracked) {
    return [];
  }

  // Те саме правило, що ділить вкладки: Tracked - є джерело з `is_tracked`.
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
