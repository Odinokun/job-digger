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

/**
 * Чи належить вакансія вкладці - та сама умова, що в запиті вкладок
 * (`src/server/vacancies/list.ts`). Потрібна клієнтові: після Mark as read чи
 * Favorite рядок або лишається у вкладці, або зникає з неї без перечитування
 * списку.
 */
export function belongsToJobsTab(
  vacancy: Pick<VacancyListItem, "isRead" | "isFavorite" | "closedAt">,
  tab: JobsTab,
): boolean {
  const isActive = vacancy.closedAt === null;

  switch (tab) {
    case "unread":
      return isActive && !vacancy.isRead;
    case "read":
      return isActive && vacancy.isRead;
    case "favorites":
      return vacancy.isFavorite;
    case "all":
      return isActive;
  }
}
