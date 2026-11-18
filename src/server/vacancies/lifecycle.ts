/**
 * Життєвий цикл вакансії: що одна перевірка джерела робить із його вакансіями в
 * базі (docs/discovery-and-parsing.md, розділ 7).
 */
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { vacancies } from "../db/schema.ts";
import type { ParseResult } from "../parsers/types.ts";
import { vacancyKey } from "./key.ts";

export interface SyncSourceVacanciesInput {
  sourceId: string;
  /** Відповідь парсера для цього джерела. */
  result: ParseResult;
  /**
   * Момент перевірки. Передається ззовні, а не береться з годинника тут: його
   * задає черга, а тест може порівнювати дати на рівність.
   */
  checkedAt: Date;
}

export async function syncSourceVacancies(
  db: NodePgDatabase,
  { sourceId, result, checkedAt }: SyncSourceVacanciesInput,
): Promise<void> {
  if (!result.ok) return;

  await db
    .insert(vacancies)
    .values(
      result.vacancies.map((vacancy) => ({
        sourceId,
        key: vacancyKey(vacancy),
        title: vacancy.title,
        url: vacancy.url,
        location: vacancy.location,
        firstDetectedAt: checkedAt,
        lastSeenAt: checkedAt,
      })),
    )
    // Вакансія вже є - оновлюються лише поля перевірки. Read і Favorite належать
    // користувачеві й сюди не потрапляють (розділ 7, «Одночасні зміни»).
    .onConflictDoUpdate({
      target: [vacancies.sourceId, vacancies.key],
      set: {
        // `excluded` - рядок, який ми намагалися вставити
        // (https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT).
        // Нова адреса тут можлива лише для ключа з ID: без ID інша адреса дає
        // інший ключ, тобто іншу вакансію (`key.ts`).
        title: sql.raw(`excluded.${vacancies.title.name}`),
        url: sql.raw(`excluded.${vacancies.url.name}`),
        location: sql.raw(`excluded.${vacancies.location.name}`),
        lastSeenAt: checkedAt,
      },
    });
}
