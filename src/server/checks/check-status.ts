/**
 * Стан загальної перевірки для опитування з інтерфейсу: хід активного запуску
 * і кількість непрочитаних (docs/checks-and-queue.md, розділ 8).
 */
import { and, eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { CheckStatus } from "../../lib/checks/check-status.ts";
import { checkRuns } from "../db/schema.ts";
import { countUnread } from "../vacancies/marks.ts";

export async function getCheckStatus(
  db: NodePgDatabase,
  { userId }: { userId: string },
): Promise<CheckStatus> {
  const [[run], { count: unread }] = await Promise.all([
    db
      .select({
        total: checkRuns.sourcesTotal,
        checked: checkRuns.sourcesChecked,
        failed: checkRuns.sourcesFailed,
        newVacancies: checkRuns.newVacancies,
        removedVacancies: checkRuns.removedVacancies,
      })
      .from(checkRuns)
      // Активний запуск у користувача один - це тримає унікальний індекс.
      .where(and(eq(checkRuns.userId, userId), isNull(checkRuns.finishedAt))),
    countUnread(db, { userId }),
  ]);

  return { run: run ?? null, unread };
}
