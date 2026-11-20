"use server";

import { runAction } from "@/app/action-result";
import { revalidateHeaderCounts } from "@/app/components/header-counts";
import type { Cursor } from "@/lib/pagination/cursor";
import {
  parseJobsTab,
  type VacancyListItem,
} from "@/lib/vacancies/vacancy-list";
import { getDb } from "@/server/db/client";
import { getSystemUser } from "@/server/db/system-user";
import { listVacancies } from "@/server/vacancies/list";
import {
  countRead,
  countUnread,
  markAllRead,
  markAllUnread,
  setVacancyFavorite,
  setVacancyRead,
} from "@/server/vacancies/marks";

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
 * Результат дії для рядка. Після успішного запису застосунок позначається
 * застарілим (`revalidateHeaderCounts`) - заради лічильника в шапці і тому, що
 * рядок зникає з вкладки одразу, ще до запису,
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
    revalidateHeaderCounts();
  }

  return outcome.ok ? { ok: true, vacancy: outcome.value } : { ok: false };
}

/**
 * Mark all as read, крок 1: скільки непрочитаних і межа дії. Діалог показує
 * число, а крок 2 позначає записані не пізніше межі (`countUnread`).
 */
export async function countUnreadAction(): Promise<
  { ok: true; count: number; asOf: string } | { ok: false }
> {
  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    return countUnread(db, { userId: user.id });
  });

  return outcome.ok ? { ok: true, ...outcome.value } : { ok: false };
}

/**
 * Mark all as read, крок 2. Межа - недовірений ввід: не рядок - відмова, а
 * рядок не у формі часу бази `markAllRead` просто не виконує.
 */
export async function markAllReadAction(
  asOf: unknown,
): Promise<{ ok: true; marked: number } | { ok: false }> {
  if (typeof asOf !== "string") {
    return { ok: false };
  }

  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    return markAllRead(db, { userId: user.id, asOf });
  });

  if (!outcome.ok) {
    return { ok: false };
  }

  revalidateHeaderCounts();

  return { ok: true, marked: outcome.value };
}

/**
 * Mark all as unread, крок 1: скільки вакансій у вкладці Read - число для
 * діалогу (задача 6.18).
 */
export async function countReadAction(): Promise<
  { ok: true; count: number } | { ok: false }
> {
  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    return countRead(db, { userId: user.id });
  });

  return outcome.ok ? { ok: true, count: outcome.value } : { ok: false };
}

/**
 * Mark all as unread, крок 2: усі вакансії вкладки Read - знову в Unread.
 * Аргументів немає, тож і недовіреного вводу теж; межі немає свідомо
 * (`markAllUnread`).
 */
export async function markAllUnreadAction(): Promise<
  { ok: true; marked: number } | { ok: false }
> {
  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    return markAllUnread(db, { userId: user.id });
  });

  if (!outcome.ok) {
    return { ok: false };
  }

  revalidateHeaderCounts();

  return { ok: true, marked: outcome.value };
}
