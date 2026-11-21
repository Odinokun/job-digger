/**
 * Стан загальної перевірки для опитування з інтерфейсу: хід активного запуску,
 * непоказаний підсумок і кількість непрочитаних (src/server/checks/README.md).
 */
import { and, desc, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { CheckStatus } from "../../lib/checks/check-status.ts";
import { checkRuns } from "../db/schema.ts";
import { countUnread } from "../vacancies/marks.ts";
import { isFindingNewPages } from "./find-new-pages.ts";

export async function getCheckStatus(
  db: NodePgDatabase,
  { userId }: { userId: string },
): Promise<CheckStatus> {
  const [[run], [summary], { count: unread }, findingNewPages] =
    await Promise.all([
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
      db
        .select({
          runId: checkRuns.id,
          checked: checkRuns.sourcesChecked,
          failed: checkRuns.sourcesFailed,
          newVacancies: checkRuns.newVacancies,
          removedVacancies: checkRuns.removedVacancies,
        })
        .from(checkRuns)
        .where(
          and(
            eq(checkRuns.userId, userId),
            isNotNull(checkRuns.finishedAt),
            isNull(checkRuns.summaryShownAt),
          ),
        )
        // Кілька непоказаних (автоперевірки за відсутності) - лише останній.
        .orderBy(desc(checkRuns.finishedAt))
        .limit(1),
      countUnread(db, { userId }),
      isFindingNewPages(db, userId),
    ]);

  return {
    run: run ?? null,
    summary: summary ?? null,
    unread,
    findingNewPages,
  };
}

export interface MarkSummaryShownInput {
  userId: string;
  runId: string;
  now: Date;
}

/**
 * Підсумок показано: позначаються цей запуск і всі старші непоказані того самого
 * користувача - інакше після кількох автоперевірок підсумки спливали б один за
 * одним. Новіші не чіпаються: їхнього підсумку користувач ще не бачив.
 */
export async function markSummaryShown(
  db: NodePgDatabase,
  { userId, runId, now }: MarkSummaryShownInput,
): Promise<void> {
  // Чужий `runId` дає `null`, а порівняння з `null` - жодного рядка.
  const shownFinishedAt = sql`(
    select ${checkRuns.finishedAt} from ${checkRuns}
    where ${checkRuns.id} = ${runId} and ${checkRuns.userId} = ${userId}
  )`;

  await db
    .update(checkRuns)
    .set({ summaryShownAt: now })
    .where(
      and(
        eq(checkRuns.userId, userId),
        isNull(checkRuns.summaryShownAt),
        lte(checkRuns.finishedAt, shownFinishedAt),
      ),
    );
}
