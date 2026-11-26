import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { settings } from "../db/schema.ts";
import {
  DEFAULT_AUTO_CHECK_INTERVAL,
  parseAutoCheckInterval,
  type AutoCheckInterval,
} from "../../lib/settings/auto-check-interval.ts";

export type Settings = { autoCheckIntervalHours: AutoCheckInterval };

/**
 * The user's settings. The row may be missing - then the defaults apply: the row
 * appears only with the first choice.
 */
export async function getSettings(
  db: NodePgDatabase,
  userId: string,
): Promise<Settings> {
  const [row] = await db
    .select({ autoCheckIntervalHours: settings.autoCheckIntervalHours })
    .from(settings)
    .where(eq(settings.userId, userId));

  return {
    // The `CHECK` in the database lets no other values in, and parsing only narrows the type.
    autoCheckIntervalHours:
      parseAutoCheckInterval(row?.autoCheckIntervalHours) ??
      DEFAULT_AUTO_CHECK_INTERVAL,
  };
}

/**
 * Remembers the auto-check interval. One `insert ... on conflict` query: the
 * first choice creates the row, the next ones update it.
 */
export async function setAutoCheckInterval(
  db: NodePgDatabase,
  userId: string,
  hours: AutoCheckInterval,
): Promise<void> {
  await db
    .insert(settings)
    .values({ userId, autoCheckIntervalHours: hours })
    .onConflictDoUpdate({
      target: settings.userId,
      set: { autoCheckIntervalHours: hours, updatedAt: sql`now()` },
    });
}
