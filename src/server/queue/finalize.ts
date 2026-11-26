/**
 * Finishing general checks. The rules are in the README.md next to this file, "Finishing a run".
 */
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { checkRuns, checkTasks } from "../db/schema.ts";
import type { CheckTaskError } from "./task-error.ts";

/**
 * How long a run may stand without movement before it is closed. Longer than
 * `STALE_AFTER_MS`: a stuck task has time to go back to the queue first
 * (src/server/queue/README.md).
 */
export const IDLE_RUN_MS = 15 * 60_000;

const ABANDONED: CheckTaskError = { reason: "abandoned" };

export interface FinalizeResult {
  /** Closed because all the tasks finished. */
  completed: number;
  /** Closed because the run stood without movement. */
  abandoned: number;
}

export async function finalizeRuns(
  db: NodePgDatabase,
  { now }: { now: Date },
): Promise<FinalizeResult> {
  const unfinished = sql`${checkTasks.status} in ('queued', 'running')`;

  return db.transaction(async (tx) => {
    // All tasks are finished - the run ended when the last one finished. If no
    // tasks are left (the sources were deleted), now.
    const completed = await tx.execute(sql`
      update ${checkRuns} as r
      set finished_at = coalesce(
        (select max(t.finished_at) from ${checkTasks} as t where t.run_id = r.id),
        ${now}
      )
      where r.finished_at is null
        and not exists (
          select 1 from ${checkTasks} where ${checkTasks.runId} = r.id and ${unfinished}
        )
      returning r.id
    `);

    // A run's movement is the start, a claim or a finish of its tasks. A run
    // without movement is closed at the moment of its last movement: Duration in
    // History shows the work, not the computer sleeping. Its unfinished tasks
    // fail, and the counters do not change - "with whatever numbers there are".
    const abandoned = await tx.execute(sql`
      with idle as (
        select r.id, greatest(r.started_at, max(t.locked_at), max(t.finished_at)) as last_move
        from ${checkRuns} as r
        left join ${checkTasks} as t on t.run_id = r.id
        where r.finished_at is null
        group by r.id
        having greatest(r.started_at, max(t.locked_at), max(t.finished_at))
          <= ${new Date(now.getTime() - IDLE_RUN_MS)}
      ),
      closed as (
        update ${checkRuns} as r
        set finished_at = idle.last_move
        from idle
        where r.id = idle.id
        returning r.id
      ),
      dropped as (
        update ${checkTasks}
        set status = 'failed', finished_at = ${now}, error = ${JSON.stringify(ABANDONED)}::jsonb
        from closed
        where ${checkTasks.runId} = closed.id and ${unfinished}
      )
      select id from closed
    `);

    return {
      completed: completed.rowCount ?? 0,
      abandoned: abandoned.rowCount ?? 0,
    };
  });
}
