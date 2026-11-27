/**
 * The vacancy list on the Jobs page: tabs and rows.
 *
 * It lives in `src/lib`, not in `src/server`: the client list with Load more needs
 * the types too.
 */

/** The tabs in the order the page shows them. */
export const JOBS_TABS = ["unread", "read", "favorites", "all"] as const;

/**
 * - `unread` - active, not read yet;
 * - `read` - active, read;
 * - `favorites` - everything in Favorites, including those gone from the site (Closed);
 * - `all` - all active ones.
 *
 * Active means without the Closed mark.
 */
export type JobsTab = (typeof JOBS_TABS)[number];

/** How many rows each tab has - the numbers in the Jobs tab names. */
export type JobsTabCounts = Record<JobsTab, number>;

export type VacancyListItem = {
  id: string;
  title: string;
  /** The link to the original; the parser lets only http and https through. */
  url: string;
  /** There may be no location - then the row shows "—". */
  location: string | null;
  /** The company name - through the "vacancy → source → company" link. */
  companyName: string;
  firstDetectedAt: Date;
  isRead: boolean;
  isFavorite: boolean;
  /**
   * When the vacancy was added to Favorites, or `null` - not a favorite, or added
   * before the app started remembering this.
   */
  favoritedAt: Date | null;
  /** When a vacancy in Favorites disappeared from the site, or `null` if it is active. */
  closedAt: Date | null;
};

/**
 * The tab from an untrusted value: an address parameter or a Server Action
 * argument. Anything unknown is Unread, because it opens by default.
 */
export function parseJobsTab(value: unknown): JobsTab {
  return typeof value === "string" &&
    (JOBS_TABS as readonly string[]).includes(value)
    ? (value as JobsTab)
    : "unread";
}

/**
 * Whether a vacancy belongs to a tab - the same condition as in the tab query
 * (`src/server/vacancies/list.ts`). The client needs it: after Mark as read or
 * Favorite a row either stays in the tab or leaves it without rereading the list.
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

/** A change of one vacancy's marks - what a Read or Favorite action promises to do. */
export type VacancyPatch = {
  id: string;
  changes: Partial<Pick<VacancyListItem, "isRead" | "isFavorite">>;
};

/**
 * The list with the mark change applied - the optimistic state of the Jobs page
 * (`useOptimistic`): the action is visible at once, before the server answers. A pure
 * function, as React requires. The other rows stay the same objects.
 */
export function patchVacancy(
  items: VacancyListItem[],
  { id, changes }: VacancyPatch,
): VacancyListItem[] {
  return items.map((item) => (item.id === id ? { ...item, ...changes } : item));
}

/**
 * Tab counts allowing for actions still in progress. `before` holds the rows as the
 * server knows them, `after` the same rows with optimistic changes (`patchVacancy`).
 * A row that changed tabs moves one from one count to the other at once, together
 * with the row itself, without waiting for fresh numbers from the server. Rows are
 * matched by id; a row missing from either list is not counted.
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
 * The date a vacancy is ordered by in the tab list - the same as `sortKey` in the
 * query (`src/server/vacancies/list.ts`): in Favorites, the date it was added to
 * favorites (for old favorites without one, the detection date); elsewhere, the
 * detection date.
 */
function listedAt(vacancy: ListedVacancy, tab: JobsTab): Date {
  return tab === "favorites"
    ? (vacancy.favoritedAt ?? vacancy.firstDetectedAt)
    : vacancy.firstDetectedAt;
}

/**
 * Whether vacancy `a` stands above `b` in the tab list - the tab query order: the
 * date (`listedAt`), then id, both descending. Postgres compares UUIDs byte by
 * byte, and for lower-case strings that is the same as comparing strings.
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
 * How many vacancies of a fresh first page of the tab are new to the shown list
 * (task 4.13): they are not among the shown ones, and they stand above the last
 * shown row.
 *
 * The second condition filters out rows that moved up from the next page when shown
 * ones left the tab (read in Unread): they are not new, Load more will show them. A
 * new vacancy itself may land in the middle of the list - vacancies of one check have
 * one detection date, and id orders them among themselves.
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

/**
 * The shown list with a row in its place - in tab order, as in the query. Undo needs
 * it: a vacancy that left the tab (read in Unread, removed from Favorites) goes back
 * to where it stood. An already shown row is replaced, and one that does not belong
 * to the tab is removed.
 */
export function placeVacancy(
  items: VacancyListItem[],
  row: VacancyListItem,
  tab: JobsTab,
): VacancyListItem[] {
  const without = items.filter((item) => item.id !== row.id);

  if (!belongsToJobsTab(row, tab)) {
    return without;
  }

  const index = without.findIndex((item) => isListedBefore(row, item, tab));

  return index === -1
    ? [...without, row]
    : [...without.slice(0, index), row, ...without.slice(index)];
}

/** How long a vacancy stays in the recent favorites group. */
export const RECENT_FAVORITE_MS = 12 * 60 * 60 * 1000;

/**
 * Whether the vacancy was added to Favorites in the last 12 hours - for the "Last 12
 * hours" group on the Favorites tab. A rolling window, not a calendar day: it does
 * not depend on the time zone and does not empty at midnight (the author's decision
 * of 24.11.2026).
 */
export function isRecentFavorite(
  vacancy: Pick<VacancyListItem, "favoritedAt">,
  now: Date,
): boolean {
  return (
    vacancy.favoritedAt !== null &&
    now.getTime() - vacancy.favoritedAt.getTime() < RECENT_FAVORITE_MS
  );
}
