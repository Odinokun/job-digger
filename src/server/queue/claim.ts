/**
 * Claiming a task from the queue. The rules are in the README.md next to this file, "Claiming".
 */
import { asc, count, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { checkTasks } from "../db/schema.ts";
import type { ReadDepth } from "../parsers/vacancies-to-check.ts";

/**
 * The advisory lock key that serializes claims. The number is arbitrary - what
 * matters is that nothing else in the app uses it.
 */
const CLAIM_LOCK_KEY = 4_020_001;

export interface ClaimInput {
  now: Date;
  /** How many tasks may run at the same time - shared by all processes. */
  maxRunning: number;
}

/**
 * A claimed task. `lockedAt` is also the sign of ownership: the result is
 * accepted only while it matches the one in the database (`finishTask`).
 */
export type ClaimedTask = {
  id: string;
  runId: string | null;
  attempts: number;
  lockedAt: Date;
} & (
  | {
      kind: "check";
      sourceId: string;
      /** How much to read (task 6.16): Check all reads the first page, and so on. */
      readDepth: ReadDepth;
    }
  /** Find new pages for a company (task 5.10). */
  | { kind: "discover"; companyId: string }
);

export async function claimTask(
  db: NodePgDatabase,
  { now, maxRunning }: ClaimInput,
): Promise<ClaimedTask | null> {
  return db.transaction(async (tx) => {
    // "How many are already running" and the claim have to be one step for all
    // processes, otherwise several simultaneous claims see a free slot and
    // exceed the limit. The lock is released at the end of the transaction.
    await tx.execute(sql`select pg_advisory_xact_lock(${CLAIM_LOCK_KEY})`);

    const [{ running }] = await tx
      .select({ running: count() })
      .from(checkTasks)
      .where(eq(checkTasks.status, "running"));
    if (running >= maxRunning) return null;

    // `skip locked`: a row another transaction holds right now (for example,
    // returning stuck tasks) is not waited for - we take the next one.
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
        readDepth: checkTasks.readDepth,
      });

    const { kind, sourceId, companyId, readDepth, ...rest } = claimed;
    // The target matches the kind - the `check_tasks_target_matches_kind` CHECK
    // holds this, but the compiler does not know about it.
    if (kind === "check" && sourceId !== null) {
      return { ...rest, lockedAt: now, kind, sourceId, readDepth };
    }
    if (kind === "discover" && companyId !== null) {
      return { ...rest, lockedAt: now, kind, companyId };
    }
    throw new Error(`Check task ${claimed.id} has no target for its kind`);
  });
}
