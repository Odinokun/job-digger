/**
 * Захоплення завдання з черги. Правила - README.md поруч, «Захоплення».
 */
import { asc, count, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { checkTasks } from "../db/schema.ts";

/**
 * Ключ advisory lock, яким серіалізуються захоплення. Число довільне - головне,
 * щоб ним більше ніщо в застосунку не користувалося.
 */
const CLAIM_LOCK_KEY = 4_020_001;

export interface ClaimInput {
  now: Date;
  /** Скільки завдань може виконуватися одночасно - спільно для всіх процесів. */
  maxRunning: number;
}

/**
 * Захоплене завдання. `lockedAt` - ще й знак власності: результат приймається,
 * лише поки він збігається з тим, що в базі (`finishTask`).
 */
export type ClaimedTask = {
  id: string;
  runId: string | null;
  attempts: number;
  lockedAt: Date;
} & (
  | { kind: "check"; sourceId: string }
  /** Find new pages для компанії (задача 5.10). */
  | { kind: "discover"; companyId: string }
);

export async function claimTask(
  db: NodePgDatabase,
  { now, maxRunning }: ClaimInput,
): Promise<ClaimedTask | null> {
  return db.transaction(async (tx) => {
    // «Скільки вже виконується» і захоплення мають бути одним кроком для всіх
    // процесів, інакше кілька одночасних claim побачать вільне місце і
    // перевищать ліміт. Блокування знімається саме в кінці транзакції.
    await tx.execute(sql`select pg_advisory_xact_lock(${CLAIM_LOCK_KEY})`);

    const [{ running }] = await tx
      .select({ running: count() })
      .from(checkTasks)
      .where(eq(checkTasks.status, "running"));
    if (running >= maxRunning) return null;

    // `skip locked`: рядок, який зараз тримає інша транзакція (наприклад,
    // повернення завислих), не чекаємо, а беремо наступний.
    const [next] = await tx
      .select({ id: checkTasks.id })
      .from(checkTasks)
      .where(eq(checkTasks.status, "queued"))
      .orderBy(asc(checkTasks.priority), asc(checkTasks.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (next === undefined) return null;

    const [claimed] = await tx
      .update(checkTasks)
      .set({
        status: "running",
        lockedAt: now,
        attempts: sql`${checkTasks.attempts} + 1`,
      })
      .where(eq(checkTasks.id, next.id))
      .returning({
        id: checkTasks.id,
        kind: checkTasks.kind,
        sourceId: checkTasks.sourceId,
        companyId: checkTasks.companyId,
        runId: checkTasks.runId,
        attempts: checkTasks.attempts,
      });

    const { kind, sourceId, companyId, ...rest } = claimed;
    // Ціль відповідає виду - це тримає CHECK `check_tasks_target_matches_kind`,
    // але компілятор про нього не знає.
    if (kind === "check" && sourceId !== null) {
      return { ...rest, lockedAt: now, kind, sourceId };
    }
    if (kind === "discover" && companyId !== null) {
      return { ...rest, lockedAt: now, kind, companyId };
    }
    throw new Error(`Check task ${claimed.id} has no target for its kind`);
  });
}
