/**
 * Returning stuck tasks. The rules are in the README.md next to this file, "Stuck tasks".
 */
import { and, eq, gte, isNull, lt, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { checkRuns, checkTasks } from "../db/schema.ts";
import type { CheckTaskError } from "./task-error.ts";

/**
 * How long a task may be `running` before it counts as stuck. Less than the 15
 * minutes without movement after which a run is closed (`finalize.ts`) - otherwise
 * the run would close before its task had time to go back to the queue.
 */
export const STALE_AFTER_MS = 10 * 60_000;

/**
 * How many times a task is claimed before getting stuck becomes an error. Request
 * retries to a site are a separate thing; the HTTP client does those.
 */
export const MAX_ATTEMPTS = 3;

const STALLED: CheckTaskError = { reason: "stalled" };

export interface RecoverResult {
  /** Put back in the queue. */
  requeued: number;
  /** Out of attempts - the task failed. */
  failed: number;
}

export async function recoverStaleTasks(
  db: NodePgDatabase,
  { now }: { now: Date },
): Promise<RecoverResult> {
  const stale = and(
    eq(checkTasks.status, "running"),
    lte(checkTasks.lockedAt, new Date(now.getTime() - STALE_AFTER_MS)),
  );

  return db.transaction(async (tx) => {
    const requeued = await tx
      .update(checkTasks)
      .set({ status: "queued", lockedAt: null })
      .where(and(stale, lt(checkTasks.attempts, MAX_ATTEMPTS)))
      .returning({ id: checkTasks.id });

    const failed = await tx
      .update(checkTasks)
      .set({ status: "failed", finishedAt: now, error: STALLED })
      .where(and(stale, gte(checkTasks.attempts, MAX_ATTEMPTS)))
      .returning({ runId: checkTasks.runId });

    // A failed task counts in the run the same way as a site error.
    const failedPerRun = new Map<string, number>();
    for (const { runId } of failed) {
      if (runId !== null) {
        failedPerRun.set(runId, (failedPerRun.get(runId) ?? 0) + 1);
      }
    }
    for (const [runId, count] of failedPerRun) {
      await tx
        .update(checkRuns)
        .set({
          sourcesChecked: sql`${checkRuns.sourcesChecked} + ${count}`,
          sourcesFailed: sql`${checkRuns.sourcesFailed} + ${count}`,
        })
        .where(and(eq(checkRuns.id, runId), isNull(checkRuns.finishedAt)));
    }

    return { requeued: requeued.length, failed: failed.length };
  });
}
