/**
 * Find new pages: a repeated career page search for every company of the Not
 * tracked tab (task 5.10). Only the queuing is here - the queue loop searches for
 * each company (`queue/discover-task.ts`).
 */
import { and, eq, inArray, isNull, notExists, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { careerSources, checkTasks, companies } from "../db/schema.ts";

/**
 * The advisory lock key that serializes Find new pages runs of one user. The first
 * number is the action itself, the second the user.
 */
const FIND_NEW_PAGES_LOCK_KEY = 5_100_001;

export interface StartFindNewPagesInput {
  userId: string;
  /** The time of queuing. */
  now: Date;
}

export type StartFindNewPagesResult =
  | { ok: true; total: number }
  | { ok: false; reason: "already-running" | "nothing-to-search" };

/**
 * Queues a search for every Not tracked company - in the background, like Check
 * all, and without a run: Find new pages is not recorded in History.
 *
 * Without a run row, a unique index cannot hold one active action per user as in
 * Check all, so the "is it running" check and the insert go under the user's
 * advisory lock: a second simultaneous click waits for the first and sees its
 * tasks.
 */
export async function startFindNewPages(
  db: NodePgDatabase,
  { userId, now }: StartFindNewPagesInput,
): Promise<StartFindNewPagesResult> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${FIND_NEW_PAGES_LOCK_KEY}, hashtext(${userId}))`,
    );

    if (await isFindingNewPages(tx, userId)) {
      return { ok: false, reason: "already-running" };
    }

    // The Not tracked tab holds companies without a single tracked source.
    const notTracked = await tx
      .select({ id: companies.id })
      .from(companies)
      .where(
        and(
          eq(companies.userId, userId),
          notExists(
            tx
              .select({ id: careerSources.id })
              .from(careerSources)
              .where(
                and(
                  sql`${careerSources.companyId} = ${companies.id}`,
                  eq(careerSources.isTracked, true),
                ),
              ),
          ),
        ),
      );

    if (notTracked.length === 0) {
      return { ok: false, reason: "nothing-to-search" };
    }

    await tx.insert(checkTasks).values(
      notTracked.map((company) => ({
        kind: "discover" as const,
        companyId: company.id,
        priority: "background" as const,
        createdAt: now,
      })),
    );

    return { ok: true, total: notTracked.length };
  });
}

/**
 * Whether the user's Find new pages is running: there are unfinished search tasks
 * or first checks of the boards the search added. The latter are background
 * `check` tasks without a run: Retry is manual, and Check all has a run. While they
 * run, the UI polls the state and, when they finish, re-reads the list and the
 * Jobs counter.
 */
export async function isFindingNewPages(
  db: NodePgDatabase,
  userId: string,
): Promise<boolean> {
  const unfinished = inArray(checkTasks.status, ["queued", "running"]);
  const [searches, firstChecks] = await Promise.all([
    db
      .select({ id: checkTasks.id })
      .from(checkTasks)
      .innerJoin(companies, eq(companies.id, checkTasks.companyId))
      .where(
        and(
          eq(companies.userId, userId),
          eq(checkTasks.kind, "discover"),
          unfinished,
        ),
      )
      .limit(1),
    db
      .select({ id: checkTasks.id })
      .from(checkTasks)
      .innerJoin(careerSources, eq(careerSources.id, checkTasks.sourceId))
      .innerJoin(companies, eq(companies.id, careerSources.companyId))
      .where(
        and(
          eq(companies.userId, userId),
          eq(checkTasks.kind, "check"),
          eq(checkTasks.priority, "background"),
          isNull(checkTasks.runId),
          unfinished,
        ),
      )
      .limit(1),
  ]);

  return searches.length > 0 || firstChecks.length > 0;
}
