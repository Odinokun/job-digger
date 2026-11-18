"use server";

import { runAction } from "@/app/action-result";
import type { Cursor } from "@/lib/pagination/cursor";
import {
  parseJobsTab,
  type VacancyListItem,
} from "@/lib/vacancies/vacancy-list";
import { getDb } from "@/server/db/client";
import { getSystemUser } from "@/server/db/system-user";
import { listVacancies } from "@/server/vacancies/list";

/** Наступна порція вкладки Jobs або факт збою - показати його нічим, крім toast. */
export type LoadMoreVacanciesResult =
  | { ok: true; items: VacancyListItem[]; nextCursor: Cursor | null }
  | { ok: false };

/**
 * Load more на сторінці Jobs.
 *
 * Аргументи - недовірений ввід: Server Action досяжна прямим POST-запитом.
 * Вкладку розбирає `parseJobsTab`, курсор - `listVacancies`, а користувач
 * береться на сервері.
 */
export async function loadMoreVacanciesAction(
  tab: unknown,
  after: unknown,
): Promise<LoadMoreVacanciesResult> {
  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    return listVacancies(db, {
      userId: user.id,
      tab: parseJobsTab(tab),
      after: after as Cursor | null,
    });
  });

  if (!outcome.ok) {
    return { ok: false };
  }

  return { ok: true, ...outcome.value };
}
