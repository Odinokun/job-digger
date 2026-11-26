/**
 * The result of a claimed task. The rules are in the README.md next to this file, "Result".
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { checkRuns, checkTasks } from "../db/schema.ts";
import type { SourceCheckOutcome } from "../checks/check-source.ts";
import type { ClaimedTask } from "./claim.ts";
import type { CheckTaskError } from "./task-error.ts";

/**
 * A task result: the outcome of a source check, or an error from the queue
 * itself (`task-error.ts`).
 */
export type TaskOutcome =
  SourceCheckOutcome | { ok: false; error: CheckTaskError };

export interface FinishInput {
  now: Date;
  outcome: TaskOutcome;
}

/**
 * Records the task result and adds it to the run counters. Returns `false` if
 * the result is discarded: the task no longer belongs to this worker, or its
 * source was deleted.
 */
export async function finishTask(
  db: NodePgDatabase,
  claimed: ClaimedTask,
  { now, outcome }: FinishInput,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [finished] = await tx
      .update(checkTasks)
      .set(
        outcome.ok
          ? {
              status: "succeeded",
              finishedAt: now,
              skippedVacancies: outcome.skipped,
            }
          : { status: "failed", finishedAt: now, error: outcome.error },
      )
      .where(
        and(
          eq(checkTasks.id, claimed.id),
          eq(checkTasks.status, "running"),
          // The sign of ownership: a task that went back to the queue and was
          // claimed again has a different `locked_at`.
          eq(checkTasks.lockedAt, claimed.lockedAt),
        ),
      )
      .returning({ runId: checkTasks.runId });

    if (finished === undefined) return false;
    if (finished.runId === null) return true;

    const [newVacancies, removedVacancies, failed] = outcome.ok
      ? [outcome.newVacancies, outcome.removedVacancies, 0]
      : [0, 0, 1];

    await tx
      .update(checkRuns)
      .set({
        sourcesChecked: sql`${checkRuns.sourcesChecked} + 1`,
        sourcesFailed: sql`${checkRuns.sourcesFailed} + ${failed}`,
        newVacancies: sql`${checkRuns.newVacancies} + ${newVacancies}`,
        removedVacancies: sql`${checkRuns.removedVacancies} + ${removedVacancies}`,
      })
      // A finished run is already in History, and its numbers do not change.
      .where(
        and(eq(checkRuns.id, finished.runId), isNull(checkRuns.finishedAt)),
      );

    return true;
  });
}
