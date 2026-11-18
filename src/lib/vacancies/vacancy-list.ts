/**
 * Список вакансій на сторінці Jobs: вкладки й рядок (docs/ui.md, розділ 4.1).
 *
 * Лежить у `src/lib`, а не в `src/server`: типи потрібні й клієнтському списку
 * з Load more.
 */

/** Вкладки в тому порядку, у якому їх показує сторінка. */
export const JOBS_TABS = ["unread", "read", "favorites", "all"] as const;

/**
 * - `unread` - активні, ще не прочитані;
 * - `read` - активні прочитані;
 * - `favorites` - усі з Favorite, зокрема зниклі з сайту (Closed);
 * - `all` - усі активні.
 *
 * Активна - без позначки Closed.
 */
export type JobsTab = (typeof JOBS_TABS)[number];

export type VacancyListItem = {
  id: string;
  title: string;
  /** Посилання на оригінал; парсер пропускає лише http і https. */
  url: string;
  /** Локації може не бути - тоді в рядку «—». */
  location: string | null;
  /** Назва компанії - через звʼязок «вакансія → джерело → компанія». */
  companyName: string;
  firstDetectedAt: Date;
  isRead: boolean;
  isFavorite: boolean;
  /** Коли вакансія з Favorites зникла з сайту, або `null`, якщо вона активна. */
  closedAt: Date | null;
};

/**
 * Вкладка з недовіреного значення: параметра адреси або аргумента Server
 * Action. Усе невідоме - Unread, бо саме вона відкривається за замовчуванням.
 */
export function parseJobsTab(value: unknown): JobsTab {
  return typeof value === "string" &&
    (JOBS_TABS as readonly string[]).includes(value)
    ? (value as JobsTab)
    : "unread";
}
