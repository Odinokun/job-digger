"use server";

import { revalidatePath } from "next/cache";

import { runAction } from "@/app/action-result";
import type { Cursor } from "@/lib/pagination/cursor";
import {
  parseJobsTab,
  type VacancyListItem,
} from "@/lib/vacancies/vacancy-list";
import { getDb } from "@/server/db/client";
import { getSystemUser } from "@/server/db/system-user";
import { listVacancies } from "@/server/vacancies/list";
import { setVacancyFavorite, setVacancyRead } from "@/server/vacancies/marks";

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

/**
 * Рядок вакансії після дії або факт збою. `vacancy: null` - вакансії вже немає
 * (зникла з сайту чи видалена разом із закритою позначкою), і список її прибирає.
 */
export type VacancyMarkResult =
  { ok: true; vacancy: VacancyListItem | null } | { ok: false };

/**
 * Mark as read / Mark as unread. Аргументи - недовірений ввід: id перевіряє
 * `setVacancyRead` (UUID і власник), а позначка має бути саме булевою.
 */
export async function setVacancyReadAction(
  vacancyId: unknown,
  isRead: unknown,
): Promise<VacancyMarkResult> {
  if (typeof vacancyId !== "string" || typeof isRead !== "boolean") {
    return { ok: false };
  }

  return markResult(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    return setVacancyRead(db, { userId: user.id, vacancyId, isRead });
  });
}

/** Favorite / Remove from Favorites - те саме, що з Read. */
export async function setVacancyFavoriteAction(
  vacancyId: unknown,
  isFavorite: unknown,
): Promise<VacancyMarkResult> {
  if (typeof vacancyId !== "string" || typeof isFavorite !== "boolean") {
    return { ok: false };
  }

  return markResult(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    return setVacancyFavorite(db, { userId: user.id, vacancyId, isFavorite });
  });
}

/**
 * Результат дії для рядка. Після успішного запису сторінка Jobs позначається
 * застарілою (`revalidatePath`): рядок зникає з вкладки одразу, ще до запису,
 * тож людина встигає перейти на іншу вкладку, поки дія триває, - і без цього
 * бачила б там список, прочитаний до запису, без вакансії, яку щойно
 * позначила (задача 3.22). `revalidatePath` у Server Function оновлює
 * сторінку, яку зараз видно, і скидає клієнтський кеш
 * (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md).
 */
async function markResult(
  work: () => Promise<VacancyListItem | null>,
): Promise<VacancyMarkResult> {
  const outcome = await runAction(work);

  if (outcome.ok) {
    revalidatePath("/");
  }

  return outcome.ok ? { ok: true, vacancy: outcome.value } : { ok: false };
}
