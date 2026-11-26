/**
 * Vacancy lists for the Jobs page.
 */
import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  JOBS_TABS,
  type JobsTab,
  type JobsTabCounts,
  type VacancyListItem,
} from "../../lib/vacancies/vacancy-list.ts";
import { parseCursor, type Cursor } from "../../lib/pagination/cursor.ts";
import { careerSources, companies, vacancies } from "../db/schema.ts";
import { DB_TIME_PATTERN, dbTimeText } from "../db/time.ts";

/**
 * The fields of a Jobs list row (`VacancyListItem`). Shared by the list and by the
 * row an action on a vacancy returns (`marks.ts`): otherwise the two places would
 * drift apart. The company name needs the "vacancy → source → company" join.
 */
export const VACANCY_ROW = {
  id: vacancies.id,
  title: vacancies.title,
  url: vacancies.url,
  location: vacancies.location,
  companyName: companies.name,
  firstDetectedAt: vacancies.firstDetectedAt,
  isRead: vacancies.isRead,
  isFavorite: vacancies.isFavorite,
  favoritedAt: vacancies.favoritedAt,
  closedAt: vacancies.closedAt,
};

/** How many vacancies are shown at once. After that, Load more adds the same batch size. */
export const DEFAULT_LIMIT = 50;

/**
 * A batch of the list and the cursor of the next one. `nextCursor` exists only when
 * there really is something more.
 */
export type VacancyListPage = {
  items: VacancyListItem[];
  nextCursor: Cursor | null;
};

/**
 * What the tab is ordered by. Favorites - by the date added to favorites, fresh
 * ones on top; favorites added before that date existed stand by their discovery
 * date. The other tabs - by the discovery date.
 */
function sortKey(tab: JobsTab): SQL {
  return tab === "favorites"
    ? sql`coalesce(${vacancies.favoritedAt}, ${vacancies.firstDetectedAt})`
    : sql`${vacancies.firstDetectedAt}`;
}

/**
 * The tab condition. An active vacancy has no Closed mark; Closed happens only in
 * Favorites, because an ordinary gone vacancy is deleted (README, "Lifecycle").
 */
export function tabCondition(tab: JobsTab): SQL | undefined {
  switch (tab) {
    case "unread":
      return and(isNull(vacancies.closedAt), eq(vacancies.isRead, false));
    case "read":
      return and(isNull(vacancies.closedAt), eq(vacancies.isRead, true));
    case "favorites":
      return eq(vacancies.isFavorite, true);
    case "all":
      return isNull(vacancies.closedAt);
  }
}

/**
 * A batch of vacancies of one tab for one user, newest date first (`sortKey`).
 */
export async function listVacancies(
  db: NodePgDatabase,
  {
    userId,
    tab,
    limit = DEFAULT_LIMIT,
    after,
  }: {
    userId: string;
    tab: JobsTab;
    limit?: number;
    /**
     * The cursor of the last shown row. It comes from the client, so an unusable
     * one means "start from the beginning", not an error - as in the company list.
     */
    after?: Cursor | null;
  },
): Promise<VacancyListPage> {
  const parsed = parseCursor(after);
  const cursor =
    parsed !== null && DB_TIME_PATTERN.test(parsed.key) ? parsed : null;
  const key = sortKey(tab);

  const rows = await db
    // The cursor key is the sort key with microseconds: a cursor built from a JS
    // `Date` would bring the row at the batch boundary a second time.
    .select({ ...VACANCY_ROW, cursorKey: dbTimeText(key) })
    .from(vacancies)
    // The user only through the company: a vacancy has no `user_id` of its own.
    .innerJoin(careerSources, eq(vacancies.sourceId, careerSources.id))
    .innerJoin(companies, eq(careerSources.companyId, companies.id))
    .where(
      and(
        eq(companies.userId, userId),
        tabCondition(tab),
        // Comparing the pair is exactly "the next row in the same order", as in the
        // company list, only towards older ones.
        cursor
          ? sql`(${key}, ${vacancies.id}) < (${cursor.key}::timestamptz, ${cursor.id}::uuid)`
          : undefined,
      ),
    )
    // `id` makes the order unambiguous for equal dates: one check gives all
    // vacancies of a source the same discovery moment.
    .orderBy(desc(key), desc(vacancies.id))
    // One row beyond the batch shows whether there is more to read.
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const visible = hasMore ? rows.slice(0, limit) : rows;
  const last = visible.at(-1);

  return {
    // The cursor key is an internal field of the query; it does not go into the list row.
    items: visible.map((row) => {
      const item: VacancyListItem & { cursorKey?: string } = { ...row };
      delete item.cursorKey;
      return item;
    }),
    nextCursor: hasMore && last ? { key: last.cursorKey, id: last.id } : null,
  };
}

/**
 * Whether the user has at least one vacancy. The text of an empty tab depends on
 * it: "no vacancies yet" with an Add company button, or "everything is read".
 */
export async function hasAnyVacancy(
  db: NodePgDatabase,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ one: sql`1` })
    .from(vacancies)
    .innerJoin(careerSources, eq(vacancies.sourceId, careerSources.id))
    .innerJoin(companies, eq(careerSources.companyId, companies.id))
    .where(eq(companies.userId, userId))
    .limit(1);

  return row !== undefined;
}

/**
 * How many rows each Jobs tab has - the numbers in the tab names. The conditions are
 * the same as in `listVacancies` (`tabCondition`), so the number always equals the
 * length of the tab's list. All four in one pass over the user's vacancies.
 */
export async function countVacanciesByTab(
  db: NodePgDatabase,
  userId: string,
): Promise<JobsTabCounts> {
  const counts = Object.fromEntries(
    JOBS_TABS.map((tab) => [
      tab,
      sql<number>`(count(*) filter (where ${tabCondition(tab)}))::int`,
    ]),
  ) as Record<JobsTab, SQL<number>>;

  const [row] = await db
    .select(counts)
    .from(vacancies)
    .innerJoin(careerSources, eq(vacancies.sourceId, careerSources.id))
    .innerJoin(companies, eq(careerSources.companyId, companies.id))
    .where(eq(companies.userId, userId));

  return row;
}
