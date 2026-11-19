/**
 * Перевірка одного карʼєрного джерела: прочитати парсером, застосувати
 * життєвий цикл вакансій і записати стан перевірки джерела. Спільна для Check
 * now (`check-company.ts`) і черги (`queue/run-task.ts`).
 */
import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { CareerPlatform } from "../../lib/companies/platform.ts";
import { careerSources } from "../db/schema.ts";
import type { HttpClient } from "../http/client.ts";
import { readSource } from "../parsers/read-source.ts";
import type { ParserError } from "../parsers/types.ts";
import { syncSourceVacancies } from "../vacancies/lifecycle.ts";

export interface SourceToCheck {
  id: string;
  url: string;
  platform: CareerPlatform;
}

/** Підсумок перевірки джерела - те, що черга записує в завдання і запуск. */
export type SourceCheckOutcome =
  | {
      ok: true;
      newVacancies: number;
      removedVacancies: number;
      /** Записи, пропущені парсером через ваду даних - parse warning. */
      skipped: number;
    }
  | { ok: false; error: ParserError };

/**
 * Перевіряє джерело. `null` - для платформи ще немає парсера: таке джерело не
 * перевіряється взагалі, тож і стан перевірки в нього не змінюється.
 */
export async function checkSource(
  db: NodePgDatabase,
  client: HttpClient,
  source: SourceToCheck,
  checkedAt: Date,
): Promise<SourceCheckOutcome | null> {
  const result = await readSource(source, client);

  if (result === null) {
    return null;
  }

  const counts = await syncSourceVacancies(db, {
    sourceId: source.id,
    result,
    checkedAt,
  });

  await db
    .update(careerSources)
    .set(
      result.ok
        ? {
            lastCheckedAt: checkedAt,
            lastSuccessAt: checkedAt,
            consecutiveFailures: 0,
          }
        : {
            lastCheckedAt: checkedAt,
            consecutiveFailures: sql`${careerSources.consecutiveFailures} + 1`,
          },
    )
    .where(eq(careerSources.id, source.id));

  return result.ok
    ? { ok: true, ...counts, skipped: result.skipped }
    : { ok: false, error: result.error };
}
