/**
 * Результат захопленого завдання. Правила - README.md поруч, «Результат».
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { checkRuns, checkTasks } from "../db/schema.ts";
import type { SourceCheckOutcome } from "../checks/check-source.ts";
import type { ClaimedTask } from "./claim.ts";
import type { CheckTaskError } from "./task-error.ts";

/**
 * Результат завдання: підсумок перевірки джерела або помилка від самої черги
 * (`task-error.ts`).
 */
export type TaskOutcome =
  SourceCheckOutcome | { ok: false; error: CheckTaskError };

export interface FinishInput {
  now: Date;
  outcome: TaskOutcome;
}

/**
 * Записує результат завдання і додає його до лічильників запуску. Повертає
 * `false`, якщо результат відкинуто: завдання вже не належить цьому обробнику
 * або його джерело видалили.
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
          // Знак власності: завдання, яке повернули в чергу й захопили знову,
          // має інший `locked_at`.
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
      // Завершений запуск уже в History, і його числа не змінюються.
      .where(
        and(eq(checkRuns.id, finished.runId), isNull(checkRuns.finishedAt)),
      );

    return true;
  });
}
