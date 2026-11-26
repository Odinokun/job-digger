/**
 * The general check state for polling from the UI: the progress of the active
 * run, the summary not yet shown and the unread count (src/server/checks/README.md).
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
        // A user has one active run - a unique index holds that.
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
        // Several unshown ones (auto-checks in the user's absence) - only the latest.
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
 * The summary has been shown: this run and all older unshown runs of the same user
 * are marked - otherwise after several auto-checks the summaries would pop up one
 * after another. Newer ones are left alone: the user has not seen their summary yet.
 */
export async function markSummaryShown(
  db: NodePgDatabase,
  { userId, runId, now }: MarkSummaryShownInput,
): Promise<void> {
  // Another user's `runId` gives `null`, and comparing with `null` matches no row.
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
