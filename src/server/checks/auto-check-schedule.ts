/**
 * The auto-check schedule (src/server/checks/README.md; task 6.02).
 *
 * The count starts from the **start** of the last general check, automatic or
 * manual: a manual Check all restarts the count, so two checks do not run in a
 * row. Who asks "is it time yet" and when is task 6.03.
 */
import { eq, max } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { checkRuns } from "../db/schema.ts";

const HOUR_MS = 3_600_000;

/**
 * At app startup a general check runs at once if the last one started longer ago
 * than this (src/server/checks/README.md).
 */
export const STARTUP_CHECK_AFTER_MS = HOUR_MS;

/**
 * When the next auto-check is due. `null` - there has been no general check yet,
 * and there is nothing to wait for: one is needed at once.
 *
 * It is computed from the current interval, not the one in force at the time of
 * the check: an interval changed in Settings applies at once.
 */
export function nextAutoCheckAt(
  lastStartedAt: Date | null,
  intervalHours: number,
): Date | null {
  return lastStartedAt === null
    ? null
    : new Date(lastStartedAt.getTime() + intervalHours * HOUR_MS);
}

/**
 * Whether an auto-check is due. Missed time (the computer was asleep) does not
 * pile up: however many intervals have passed, there is one check.
 */
export function isAutoCheckDue({
  lastStartedAt,
  intervalHours,
  now,
}: {
  lastStartedAt: Date | null;
  intervalHours: number;
  now: Date;
}): boolean {
  const next = nextAutoCheckAt(lastStartedAt, intervalHours);

  return next === null || now.getTime() >= next.getTime();
}

/**
 * Whether a general check should run at app startup: the last one started more
 * than an hour ago or there has been none. Otherwise the count continues by the
 * interval (`isAutoCheckDue`).
 */
export function isStartupCheckDue({
  lastStartedAt,
  now,
}: {
  lastStartedAt: Date | null;
  now: Date;
}): boolean {
  return (
    lastStartedAt === null ||
    now.getTime() - lastStartedAt.getTime() > STARTUP_CHECK_AFTER_MS
  );
}

/**
 * The start of the user's last general check, or `null` if there have been none.
 * A check still in progress counts too: the count starts from it, so the schedule
 * will not start a second one on top of it.
 *
 * Check now and Retry have no row in `check_runs`, so they do not shift the count.
 */
export async function lastGeneralCheckStartedAt(
  db: NodePgDatabase,
  userId: string,
): Promise<Date | null> {
  const [row] = await db
    .select({ startedAt: max(checkRuns.startedAt) })
    .from(checkRuns)
    .where(eq(checkRuns.userId, userId));

  return row?.startedAt ?? null;
}
