/**
 * Завершення загальних перевірок. Правила - README.md поруч, «Завершення запуску».
 */
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { checkRuns, checkTasks } from "../db/schema.ts";
import type { CheckTaskError } from "./task-error.ts";

/**
 * Скільки запуск може стояти без руху, перш ніж закривається. Більше за
 * `STALE_AFTER_MS`: зависле завдання встигає повернутися в чергу раніше
 * (docs/checks-and-queue.md, розділ 8).
 */
export const IDLE_RUN_MS = 15 * 60_000;

const ABANDONED: CheckTaskError = { reason: "abandoned" };

export interface FinalizeResult {
  /** Закрито, бо всі завдання завершилися. */
  completed: number;
  /** Закрито, бо запуск стояв без руху. */
  abandoned: number;
}

export async function finalizeRuns(
  db: NodePgDatabase,
  { now }: { now: Date },
): Promise<FinalizeResult> {
  const unfinished = sql`${checkTasks.status} in ('queued', 'running')`;

  return db.transaction(async (tx) => {
    // Усі завдання завершені - запуск закінчився тоді, коли завершилося
    // останнє. Якщо завдань не лишилося (джерела видалили) - зараз.
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

    // Рух запуску - старт, захоплення чи завершення його завдань. Запуск без
    // руху закривається моментом останнього руху: Duration у History
    // показує роботу, а не сон компʼютера. Його незавершені завдання стають
    // невдалими, а лічильники не змінюються - «з тими числами, які вже є».
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
