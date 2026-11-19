/**
 * Failed Sources Drawer: невдалі джерела останньої загальної перевірки і Retry
 * для них (docs/checks-and-queue.md, розділ 8). Правила - README.md поруч,
 * «Невдалі джерела».
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type {
  FailedSource,
  FailedSourcesList,
} from "../../lib/checks/failed-sources.ts";
import { checkRuns } from "../db/schema.ts";
import type { CheckTaskError } from "../queue/task-error.ts";

interface FailedRow extends Record<string, unknown> {
  source_id: string;
  company_name: string;
  url: string;
  label: string | null;
  run_error: CheckTaskError;
  /** Статус найсвіжішого Retry після перевірки, якщо він був. */
  retry_status: "queued" | "running" | "succeeded" | "failed" | null;
  /** Помилка найсвіжішого невдалого Retry, якщо він був. */
  retry_error: CheckTaskError | null;
}

export async function listFailedSources(
  db: NodePgDatabase,
  { userId }: { userId: string },
): Promise<FailedSourcesList> {
  const [rows, active] = await Promise.all([
    db.execute<FailedRow>(sql`
      with last_run as (
        select id from check_runs
        where user_id = ${userId} and finished_at is not null
        order by finished_at desc
        limit 1
      )
      select
        s.id as source_id,
        c.name as company_name,
        s.url,
        s.label,
        t.error as run_error,
        latest.status as retry_status,
        latest_failed.error as retry_error
      from check_tasks t
      join last_run on t.run_id = last_run.id
      join career_sources s on s.id = t.source_id
      join companies c on c.id = s.company_id and c.user_id = ${userId}
      -- Retry - завдання поза запуском, створене після завдання перевірки.
      left join lateral (
        select m.status from check_tasks m
        where m.source_id = t.source_id and m.run_id is null
          and m.created_at > t.created_at
        order by m.created_at desc
        limit 1
      ) latest on true
      left join lateral (
        select m.error from check_tasks m
        where m.source_id = t.source_id and m.run_id is null
          and m.created_at > t.created_at and m.status = 'failed'
        order by m.created_at desc
        limit 1
      ) latest_failed on true
      where t.status = 'failed'
      order by c.name, s.url
    `),
    db
      .select({ id: checkRuns.id })
      .from(checkRuns)
      .where(and(eq(checkRuns.userId, userId), isNull(checkRuns.finishedAt))),
  ]);

  const items: FailedSource[] = [];
  for (const row of rows.rows) {
    // Retry вдався - джерело зникає з drawer.
    if (row.retry_status === "succeeded") continue;

    const error = row.retry_error ?? row.run_error;
    items.push({
      sourceId: row.source_id,
      companyName: row.company_name,
      url: row.url,
      label: row.label,
      // Без приведення: нова причина в `CheckTaskError` без пари в
      // `FailureReason` ламає типи тут.
      reason: error.reason,
      httpStatus: error.reason === "bad-status" ? error.status : null,
      isRetrying:
        row.retry_status === "queued" || row.retry_status === "running",
    });
  }

  return { items, canRetry: active.length === 0 };
}
