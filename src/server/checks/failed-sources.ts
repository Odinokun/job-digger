/**
 * The Failed Sources Drawer: the failed sources of the last general check and Retry
 * for them (src/server/checks/README.md). The rules are in the README.md next to
 * this file, "Failed sources".
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type {
  FailedSource,
  FailedSourcesList,
} from "../../lib/checks/failed-sources.ts";
import { checkRuns, checkTasks } from "../db/schema.ts";
import type { ReadDepth } from "../parsers/vacancies-to-check.ts";
import type { CheckTaskError } from "../queue/task-error.ts";

interface FailedRow extends Record<string, unknown> {
  source_id: string;
  company_name: string;
  url: string;
  label: string | null;
  run_error: CheckTaskError;
  /** The status of the freshest Retry after the check, if there was one. */
  retry_status: "queued" | "running" | "succeeded" | "failed" | null;
  /** The error of the freshest failed Retry, if there was one. */
  retry_error: CheckTaskError | null;
  /** How much the failed task read - Retry reads the same (6.16). */
  read_depth: ReadDepth;
}

/** A failed source together with the depth Retry will repeat. */
interface FailedWithDepth {
  item: FailedSource;
  readDepth: ReadDepth;
}

export async function listFailedSources(
  db: NodePgDatabase,
  { userId }: { userId: string },
): Promise<FailedSourcesList> {
  const { items, canRetry } = await loadFailedSources(db, { userId });

  // The depth is Retry's internal business; it does not go to the drawer.
  return { items: items.map(({ item }) => item), canRetry };
}

async function loadFailedSources(
  db: NodePgDatabase,
  { userId }: { userId: string },
): Promise<{ items: FailedWithDepth[]; canRetry: boolean }> {
  const [rows, active] = await Promise.all([
    db.execute<FailedRow>(sql`
      with last_run as (
        select id from check_runs
        where user_id = ${userId} and finished_at is not null
        order by finished_at desc
        limit 1
      )
      select
        s.id as source_id,
        c.name as company_name,
        s.url,
        s.label,
        t.error as run_error,
        t.read_depth,
        latest.status as retry_status,
        latest_failed.error as retry_error
      from check_tasks t
      join last_run on t.run_id = last_run.id
      join career_sources s on s.id = t.source_id
      join companies c on c.id = s.company_id and c.user_id = ${userId}
      -- A Retry is a task outside any run, created after the check task.
      left join lateral (
        select m.status from check_tasks m
        where m.source_id = t.source_id and m.run_id is null
          and m.created_at > t.created_at
        order by m.created_at desc
        limit 1
      ) latest on true
      left join lateral (
        select m.error from check_tasks m
        where m.source_id = t.source_id and m.run_id is null
          and m.created_at > t.created_at and m.status = 'failed'
        order by m.created_at desc
        limit 1
      ) latest_failed on true
      where t.status = 'failed'
      order by c.name, s.url
    `),
    db
      .select({ id: checkRuns.id })
      .from(checkRuns)
      .where(and(eq(checkRuns.userId, userId), isNull(checkRuns.finishedAt))),
  ]);

  const items: FailedWithDepth[] = [];
  for (const row of rows.rows) {
    // Retry succeeded - the source leaves the drawer.
    if (row.retry_status === "succeeded") continue;

    const error = row.retry_error ?? row.run_error;
    items.push({
      item: {
        sourceId: row.source_id,
        companyName: row.company_name,
        url: row.url,
        label: row.label,
        // No cast: a new reason in `CheckTaskError` without a counterpart in
        // `FailureReason` breaks the types here.
        reason: error.reason,
        httpStatus: error.reason === "bad-status" ? error.status : null,
        isRetrying:
          row.retry_status === "queued" || row.retry_status === "running",
      },
      readDepth: row.read_depth,
    });
  }

  return { items, canRetry: active.length === 0 };
}

export interface RetryFailedSourcesInput {
  userId: string;
  /** Specific sources (Retry) or all failed ones (Retry all failed). */
  sourceIds: string[] | "all";
  now: Date;
}

export type RetryFailedSourcesResult =
  { ok: true; queued: number } | { ok: false; reason: "check-running" };

/**
 * Queues a Retry: a manual task outside the run, so the History row does not
 * change, and the queue takes it ahead of background tasks. Only sources from the
 * drawer's list that are not already waiting for their Retry are retried: the ids
 * come from the client.
 */
export async function retryFailedSources(
  db: NodePgDatabase,
  { userId, sourceIds, now }: RetryFailedSourcesInput,
): Promise<RetryFailedSourcesResult> {
  const { items, canRetry } = await loadFailedSources(db, { userId });

  if (!canRetry) {
    return { ok: false, reason: "check-running" };
  }

  const targets = items.filter(
    ({ item }) =>
      !item.isRetrying &&
      (sourceIds === "all" || sourceIds.includes(item.sourceId)),
  );

  if (targets.length > 0) {
    await db.insert(checkTasks).values(
      targets.map(({ item, readDepth }) => ({
        sourceId: item.sourceId,
        priority: "manual" as const,
        readDepth,
        createdAt: now,
      })),
    );
  }

  return { ok: true, queued: targets.length };
}
