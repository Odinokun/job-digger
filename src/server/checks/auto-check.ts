/**
 * The automatic check: for each user it decides whether a general check is due,
 * and queues it with the same `startCheckAll` as a manual Check all
 * (src/server/checks/README.md; task 6.03). Who calls it and when:
 * `auto-check-scheduler.ts`.
 */
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { users } from "../db/schema.ts";
import { getSettings } from "../settings/settings.ts";
import {
  isAutoCheckDue,
  isStartupCheckDue,
  lastGeneralCheckStartedAt,
} from "./auto-check-schedule.ts";
import { startCheckAll } from "./check-all.ts";

export interface RunAutoChecksInput {
  now: Date;
  /**
   * The first call after the app starts: then the rule is different - the check
   * runs if the last one started more than an hour ago (`isStartupCheckDue`).
   */
  isStartup: boolean;
}

/**
 * One pass of the schedule over all users. Each is decided separately: for one it
 * is time, for another it is not.
 *
 * `startCheckAll` itself filters out a check already in progress and a user
 * without tracked sources (`already-running`, `nothing-to-check`) - here they are
 * simply skipped. One user's failure does not stop the others.
 */
export async function runAutoChecks(
  db: NodePgDatabase,
  { now, isStartup }: RunAutoChecksInput,
): Promise<void> {
  const all = await db.select({ id: users.id }).from(users);

  for (const { id: userId } of all) {
    try {
      const lastStartedAt = await lastGeneralCheckStartedAt(db, userId);
      const { autoCheckIntervalHours } = await getSettings(db, userId);
      const due =
        isAutoCheckDue({
          lastStartedAt,
          intervalHours: autoCheckIntervalHours,
          now,
        }) ||
        (isStartup && isStartupCheckDue({ lastStartedAt, now }));

      if (due) {
        // In full - only the sources not read in full for a day (task 6.16).
        await startCheckAll(db, { userId, depthMode: "auto", now });
      }
    } catch (error) {
      // The log is in English - a technical message.
      console.error(`Auto check for user ${userId} failed to start`, error);
    }
  }
}
