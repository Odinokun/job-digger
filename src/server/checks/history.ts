/**
 * The History list: finished general checks, newest first, in batches with a
 * cursor.
 */
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { CheckRunRow } from "../../lib/checks/check-status.ts";
import { parseCursor, type Cursor } from "../../lib/pagination/cursor.ts";
import { checkRuns } from "../db/schema.ts";
import { DB_TIME_PATTERN, dbTimeText } from "../db/time.ts";

/** A History batch: 20 records, Load more adds the next 20. */
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
    /** The cursor from the client: an unusable one means "start from the beginning". */
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
      // The start time with microseconds: a cursor from a JS `Date` would lose
      // them, and a row at the batch boundary would come a second time (`db/time.ts`).
      cursorKey: dbTimeText(checkRuns.startedAt),
    })
    .from(checkRuns)
    .where(
      and(
        eq(checkRuns.userId, userId),
        // A check still in progress does not get into History.
        isNotNull(checkRuns.finishedAt),
        cursor
          ? sql`(${checkRuns.startedAt}, ${checkRuns.id}) < (${cursor.key}::timestamptz, ${cursor.id}::uuid)`
          : undefined,
      ),
    )
    // `id` makes the order unambiguous if two checks started at the same time.
    .orderBy(desc(checkRuns.startedAt), desc(checkRuns.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const visible = hasMore ? rows.slice(0, limit) : rows;
  const last = visible.at(-1);

  return {
    // The cursor key is an internal field of the query; it does not go into the History row.
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
