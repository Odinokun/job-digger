/**
 * Автоматична перевірка: для кожного користувача вирішує, чи настав час
 * загальної перевірки, і ставить її в чергу тим самим `startCheckAll`, що й
 * ручний Check all (docs/checks-and-queue.md, розділ 8; задача 6.03). Хто й
 * коли викликає - `auto-check-scheduler.ts`.
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
   * Перший виклик після старту застосунку: тоді правило інше - перевірка
   * йде, якщо остання стартувала понад годину тому (`isStartupCheckDue`).
   */
  isStartup: boolean;
}

/**
 * Один прохід розкладу по всіх користувачах. Кожен вирішується окремо: в
 * одного час настав, в іншого ні.
 *
 * Перевірку, що вже йде, і користувача без відстежуваних джерел відсіює сам
 * `startCheckAll` (`already-running`, `nothing-to-check`) - тут вони просто
 * пропускаються. Збій одного користувача не зупиняє інших.
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
        await startCheckAll(db, { userId, now });
      }
    } catch (error) {
      // Лог англійською - технічне повідомлення.
      console.error(`Auto check for user ${userId} failed to start`, error);
    }
  }
}
