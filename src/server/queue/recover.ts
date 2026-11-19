/**
 * Повернення завислих завдань. Правила - README.md поруч, «Завислі завдання».
 */
import { and, eq, gte, isNull, lt, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { checkRuns, checkTasks } from "../db/schema.ts";
import type { CheckTaskError } from "./task-error.ts";

/**
 * Скільки завдання може бути `running`, перш ніж вважається завислим. Менше за
 * 15 хвилин без руху, після яких закривається запуск (`finalize.ts`), - інакше
 * запуск закривався б раніше, ніж його завдання встигло б повернутися в чергу.
 */
export const STALE_AFTER_MS = 10 * 60_000;

/**
 * Скільки разів завдання захоплюється, перш ніж зависання стає помилкою.
 * Повтори запитів до сайту - окрема річ, їх робить HTTP-клієнт.
 */
export const MAX_ATTEMPTS = 3;

const STALLED: CheckTaskError = { reason: "stalled" };

export interface RecoverResult {
  /** Повернуто в чергу. */
  requeued: number;
  /** Спроби скінчилися - завдання невдале. */
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

    // Невдале завдання рахується в запуску так само, як помилка сайту.
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
