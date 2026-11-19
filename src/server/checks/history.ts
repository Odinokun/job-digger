/**
 * Список History (docs/ui.md, розділ 4.4): завершені загальні перевірки від
 * найновішої, порціями з курсором.
 */
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { CheckRunRow } from "../../lib/checks/check-status.ts";
import { parseCursor, type Cursor } from "../../lib/pagination/cursor.ts";
import { checkRuns } from "../db/schema.ts";
import { DB_TIME_PATTERN, dbTimeText } from "../db/time.ts";

/** Порція History: 20 записів, Load more додає наступні 20. */
export const HISTORY_PAGE_SIZE = 20;

export interface CheckRunPage {
  items: CheckRunRow[];
  nextCursor: Cursor | null;
}

export async function listCheckRuns(
  db: NodePgDatabase,
  {
    userId,
    limit = HISTORY_PAGE_SIZE,
    after,
  }: {
    userId: string;
    limit?: number;
    /** Курсор із клієнта: непридатний означає «почни з початку». */
    after?: Cursor | null;
  },
): Promise<CheckRunPage> {
  const parsed = parseCursor(after);
  const cursor =
    parsed !== null && DB_TIME_PATTERN.test(parsed.key) ? parsed : null;

  const rows = await db
    .select({
      id: checkRuns.id,
      startedAt: checkRuns.startedAt,
      sourcesChecked: checkRuns.sourcesChecked,
      newVacancies: checkRuns.newVacancies,
      removedVacancies: checkRuns.removedVacancies,
      durationMs: sql<number>`(extract(epoch from ${checkRuns.finishedAt} - ${checkRuns.startedAt}) * 1000)::float8`,
      // Час запуску з мікросекундами: курсор із JS `Date` губив би їх, і
      // рядок на межі порції приходив би вдруге (`db/time.ts`).
      cursorKey: dbTimeText(checkRuns.startedAt),
    })
    .from(checkRuns)
    .where(
      and(
        eq(checkRuns.userId, userId),
        // Перевірка, що ще йде, у History не потрапляє.
        isNotNull(checkRuns.finishedAt),
        cursor
          ? sql`(${checkRuns.startedAt}, ${checkRuns.id}) < (${cursor.key}::timestamptz, ${cursor.id}::uuid)`
          : undefined,
      ),
    )
    // `id` робить порядок однозначним, якщо дві перевірки стартували разом.
    .orderBy(desc(checkRuns.startedAt), desc(checkRuns.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const visible = hasMore ? rows.slice(0, limit) : rows;
  const last = visible.at(-1);

  return {
    // Ключ курсора - службове поле запиту, у рядок History він не йде.
    items: visible.map((row) => ({
      id: row.id,
      startedAt: row.startedAt,
      sourcesChecked: row.sourcesChecked,
      newVacancies: row.newVacancies,
      removedVacancies: row.removedVacancies,
      durationMs: Math.round(row.durationMs),
    })),
    nextCursor: hasMore && last ? { key: last.cursorKey, id: last.id } : null,
  };
}
