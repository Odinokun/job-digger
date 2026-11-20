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
 * Налаштування користувача. Рядка може не бути - тоді значення за
 * замовчуванням: рядок зʼявляється лише з першим вибором.
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
    // `CHECK` у базі не пускає інших значень, а розбір лише звужує тип.
    autoCheckIntervalHours:
      parseAutoCheckInterval(row?.autoCheckIntervalHours) ??
      DEFAULT_AUTO_CHECK_INTERVAL,
  };
}

/**
 * Запамʼятовує інтервал автоперевірки. Один запит `insert ... on conflict`:
 * перший вибір створює рядок, наступні його оновлюють.
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
