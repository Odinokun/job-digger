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

/** Скільки рядків у кожній вкладці - числа в назвах вкладок Jobs. */
export type JobsTabCounts = Record<JobsTab, number>;

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
  /**
   * Коли вакансію додали у Favorites, або `null` - не в обраному чи додана
   * туди до того, як застосунок почав це запам'ятовувати.
   */
  favoritedAt: Date | null;
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

/** Зміна позначок однієї вакансії - те, що дія Read чи Favorite обіцяє зробити. */
export type VacancyPatch = {
  id: string;
  changes: Partial<Pick<VacancyListItem, "isRead" | "isFavorite">>;
};

/**
 * Список із застосованою зміною позначок - оптимістичний стан сторінки Jobs
 * (`useOptimistic`): дія видна одразу, ще до відповіді сервера. Чиста функція,
 * як того вимагає React. Решта рядків лишаються тими самими обʼєктами.
 */
export function patchVacancy(
  items: VacancyListItem[],
  { id, changes }: VacancyPatch,
): VacancyListItem[] {
  return items.map((item) => (item.id === id ? { ...item, ...changes } : item));
}

/**
 * Числа вкладок з урахуванням дій, що ще тривають. `before` - рядки, як їх
 * знає сервер, `after` - ті самі рядки з оптимістичними змінами
 * (`patchVacancy`). Рядок, що змінив вкладку, переносить одиницю з однієї в
 * іншу одразу, разом із самим рядком, - не чекаючи свіжих чисел із сервера.
 * Рядки зіставляються за id; рядок, якого немає в обох списках, не враховується.
 */
export function adjustTabCounts(
  counts: JobsTabCounts,
  before: VacancyListItem[],
  after: VacancyListItem[],
): JobsTabCounts {
  const previous = new Map(before.map((item) => [item.id, item]));
  const adjusted = { ...counts };

  for (const item of after) {
    const was = previous.get(item.id);

    if (was === undefined || was === item) continue;

    for (const tab of JOBS_TABS) {
      adjusted[tab] +=
        Number(belongsToJobsTab(item, tab)) -
        Number(belongsToJobsTab(was, tab));
    }
  }

  for (const tab of JOBS_TABS) {
    adjusted[tab] = Math.max(0, adjusted[tab]);
  }

  return adjusted;
}

type ListedVacancy = Pick<
  VacancyListItem,
  "id" | "firstDetectedAt" | "favoritedAt"
>;

/**
 * Дата, за якою вакансія стоїть у списку вкладки, - та сама, що `sortKey` у
 * запиті (`src/server/vacancies/list.ts`): у Favorites - дата додавання в
 * обране (у старого обраного без неї - дата виявлення), в інших - дата
 * виявлення.
 */
function listedAt(vacancy: ListedVacancy, tab: JobsTab): Date {
  return tab === "favorites"
    ? (vacancy.favoritedAt ?? vacancy.firstDetectedAt)
    : vacancy.firstDetectedAt;
}

/**
 * Чи стоїть вакансія `a` у списку вкладки вище за `b` - порядок запиту
 * вкладок: дата (`listedAt`), потім id, обидва за спаданням. Postgres
 * порівнює UUID побайтово, а для рядків у нижньому регістрі це те саме, що
 * порівняння рядків.
 */
function isListedBefore(
  a: ListedVacancy,
  b: ListedVacancy,
  tab: JobsTab,
): boolean {
  const byDate = listedAt(a, tab).getTime() - listedAt(b, tab).getTime();

  return byDate !== 0 ? byDate > 0 : a.id > b.id;
}

/**
 * Скільки вакансій зі свіжої першої порції вкладки нові для показаного списку
 * (задача 4.13): їх немає серед показаних, і вони стоять вище за останній
 * показаний рядок.
 *
 * Друга умова відсіює рядки, що піднялися з наступної порції, коли показані
 * вийшли з вкладки (прочитали в Unread): вони не нові, їх покаже Load more.
 * Сама нова вакансія може стати і посеред списку - вакансії однієї перевірки
 * мають одну дату виявлення, і між собою їх упорядковує id.
 */
export function countNewVacancies(
  shown: ListedVacancy[],
  fresh: ListedVacancy[],
  tab: JobsTab,
): number {
  const shownIds = new Set(shown.map((item) => item.id));
  const last = shown.at(-1);

  return fresh.filter(
    (item) =>
      !shownIds.has(item.id) &&
      (last === undefined || isListedBefore(item, last, tab)),
  ).length;
}
