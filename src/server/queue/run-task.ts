/**
 * Running a claimed task: check the source and record the result, and hand a
 * search task (`discover`) to `runDiscoverTask`. The rules are in the README.md
 * next to this file, "Running a task".
 */
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { checkSource } from "../checks/check-source.ts";
import { careerSources } from "../db/schema.ts";
import type { HttpClient } from "../http/client.ts";
import type { ClaimedTask } from "./claim.ts";
import { runDiscoverTask } from "./discover-task.ts";
import { finishTask, type TaskOutcome } from "./finish.ts";

export interface RunTaskOptions {
  /** The clock for `finished_at`. Tests pass a fixed moment. */
  clock?: () => Date;
}

/**
 * Returns `false` if the result is discarded (`finishTask`): the source was
 * deleted, or the task already belongs to another worker.
 */
export async function runTask(
  db: NodePgDatabase,
  client: HttpClient,
  claimed: ClaimedTask,
  { clock = () => new Date() }: RunTaskOptions = {},
): Promise<boolean> {
  if (claimed.kind === "discover") {
    return runDiscoverTask(db, client, claimed, { clock });
  }

  const [source] = await db
    .select({
      id: careerSources.id,
      url: careerSources.url,
      platform: careerSources.platform,
      vacancyLinkPrefix: careerSources.vacancyLinkPrefix,
    })
    .from(careerSources)
    .where(eq(careerSources.id, claimed.sourceId));

  // The source was deleted after the claim - the task went with it.
  if (source === undefined) return false;

  let outcome: TaskOutcome;
  try {
    // The check moment is the claim moment: the discovery date of new vacancies
    // and the source state are counted from it.
    outcome = (await checkSource(
      db,
      client,
      source,
      claimed.lockedAt,
      claimed.readDepth,
    )) ?? {
      // A platform without a parser: there is nothing to check, and that is not
      // an error - the same as in Check now.
      ok: true,
      newVacancies: 0,
      removedVacancies: 0,
      skipped: 0,
    };
  } catch (error) {
    // A bug in our code, not on the site: parsers return site failures as
    // values. The task fails at once - otherwise it would hang until
    // `recoverStaleTasks` brought it back, three times over.
    console.error(`Check task ${claimed.id} crashed`, error);
    outcome = { ok: false, error: { reason: "crashed" } };
  }

  return finishTask(db, claimed, { now: clock(), outcome });
}
