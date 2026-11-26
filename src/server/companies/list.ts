import {
  and,
  asc,
  count,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  notExists,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  careerSources,
  checkTasks,
  companies,
  vacancies,
} from "../db/schema.ts";
import type {
  CompaniesTab,
  CompanyListItem,
  CompanySource,
} from "../../lib/companies/company-list.ts";
import { parseCursor, type Cursor } from "../../lib/pagination/cursor.ts";

/**
 * How many companies we show at once. After that, Load more adds the same amount.
 */
export const DEFAULT_LIMIT = 50;

/**
 * A page of the list: the companies themselves and where to read the next one from.
 *
 * `nextCursor` is there only when there really is more, so the Load more button
 * does not ask the database just to learn there is nothing more to show.
 */
export type CompanyListPage = {
  items: CompanyListItem[];
  nextCursor: Cursor | null;
};

/**
 * The subquery "this company has a tracked source".
 *
 * Built with the query builder rather than raw `sql`: then Drizzle wraps the
 * subquery in the parentheses that `exists` does not add.
 */
function trackedSourceSubquery(
  db: NodePgDatabase,
  companyId: typeof companies.id,
) {
  return db
    .select({ one: sql`1` })
    .from(careerSources)
    .where(
      and(
        eq(careerSources.companyId, companyId),
        eq(careerSources.isTracked, true),
      ),
    );
}

/**
 * How many failures in a row make a source a Needs attention problem. One is
 * the network blinking, not worth bothering the user (task 6.11).
 */
export const ATTENTION_FAILURES = 2;

/**
 * The subquery "the company needs attention" (task 6.11): there is a page we do
 * not read (`unsupported`, in Tracked or Not tracked), or a tracked source fails
 * `ATTENTION_FAILURES` times in a row or more. A failure of an untracked page
 * does not count - it is not checked. A page the person marked "link only"
 * (task 6.17) does not count either.
 */
function needsAttentionSubquery(
  db: NodePgDatabase,
  companyId: typeof companies.id,
) {
  return db
    .select({ one: sql`1` })
    .from(careerSources)
    .where(
      and(
        eq(careerSources.companyId, companyId),
        or(
          and(
            eq(careerSources.platform, "unsupported"),
            eq(careerSources.isReferenceOnly, false),
          ),
          and(
            eq(careerSources.isTracked, true),
            gte(careerSources.consecutiveFailures, ATTENTION_FAILURES),
          ),
        ),
      ),
    );
}

/** The condition for a company to belong to a tab. */
function tabCondition(db: NodePgDatabase, tab: CompaniesTab): SQL {
  if (tab === "all") {
    return sql`true`;
  }

  if (tab === "attention") {
    return exists(needsAttentionSubquery(db, companies.id));
  }

  const tracked = trackedSourceSubquery(db, companies.id);

  return tab === "tracked" ? exists(tracked) : notExists(tracked);
}

/** A longer search string is cut: no company name is that long. */
const QUERY_MAX_LENGTH = 100;

/**
 * The search-by-name condition: the name contains the search string, ignoring
 * case. `%`, `_` and `\` in the string are ordinary characters, not a `LIKE`
 * pattern: they are escaped with a backslash, PostgreSQL's default escape
 * character. An empty string means no condition.
 */
function nameCondition(query: string | undefined): SQL | undefined {
  const text = query?.trim().slice(0, QUERY_MAX_LENGTH) ?? "";

  if (text === "") {
    return undefined;
  }

  return ilike(companies.name, `%${text.replace(/[\\%_]/g, "\\$&")}%`);
}

/**
 * A page of companies of one tab for one user.
 *
 * `after` is the cursor of the last row shown; without it the start of the list
 * is read. The value comes from the client, so it goes through `parseCursor`: an
 * unusable cursor means "start from the beginning", not an error. `query` is the
 * search by name (the All tab); the next page asks for it the same way.
 */
export async function listCompanies(
  db: NodePgDatabase,
  {
    userId,
    tab,
    query,
    limit = DEFAULT_LIMIT,
    after,
  }: {
    userId: string;
    tab: CompaniesTab;
    query?: string;
    limit?: number;
    after?: Cursor | null;
  },
): Promise<CompanyListPage> {
  const cursor = parseCursor(after);

  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      url: companies.url,
      discoveryStatus: companies.discoveryStatus,
    })
    .from(companies)
    .where(
      and(
        eq(companies.userId, userId),
        tabCondition(db, tab),
        nameCondition(query),
        // A row comparison, not two conditions joined by OR: in PostgreSQL
        // `(a, b) > (x, y)` is exactly "the next row in the same order", and it
        // matches `ORDER BY name, id`.
        cursor
          ? sql`(${companies.name}, ${companies.id}) > (${cursor.key}, ${cursor.id}::uuid)`
          : undefined,
      ),
    )
    // The code sets the order, not the database: the list reads alphabetically by
    // name, and `id` makes the order unambiguous for equal names - without it the
    // cursor would lose rows at the page boundary.
    .orderBy(asc(companies.name), asc(companies.id))
    // One row beyond the page is a cheaper way to learn there is more than a
    // separate `count` for every Load more.
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const visible = hasMore ? rows.slice(0, limit) : rows;
  const last = visible.at(-1);

  return {
    items: await attachDetails(db, visible),
    nextCursor: hasMore && last ? { key: last.name, id: last.id } : null,
  };
}

/**
 * Fetches the sources and vacancy counts of the companies shown - with separate
 * queries.
 *
 * Separate queries, not a join: a join would repeat the company row for every
 * source, and aggregating into json would make the query noticeably more complex
 * for the same result on fifty rows.
 */
async function attachDetails(
  db: NodePgDatabase,
  rows: Omit<CompanyListItem, "sources" | "vacancies" | "lastCheckedAt">[],
): Promise<CompanyListItem[]> {
  if (rows.length === 0) {
    return [];
  }

  const sources = await db
    .select({
      id: careerSources.id,
      companyId: careerSources.companyId,
      url: careerSources.url,
      label: careerSources.label,
      platform: careerSources.platform,
      isTracked: careerSources.isTracked,
      isReferenceOnly: careerSources.isReferenceOnly,
      lastCheckedAt: careerSources.lastCheckedAt,
      lastSuccessAt: careerSources.lastSuccessAt,
      consecutiveFailures: careerSources.consecutiveFailures,
      // A source in the queue means Checking in the company status. A source has
      // only a few tasks in the queue, and there is the `check_tasks_source_idx` index.
      //
      // Table names are explicit: in a single-table query Drizzle writes columns
      // without them, and inside the subquery `"source_id" = "id"` would compare
      // columns of `check_tasks` itself.
      isChecking: sql<boolean>`exists (
        select 1 from ${checkTasks} as queued_task
        where queued_task.source_id = ${careerSources}.id
          and queued_task.status in ('queued', 'running')
      )`,
    })
    .from(careerSources)
    .where(
      inArray(
        careerSources.companyId,
        rows.map((row) => row.id),
      ),
    )
    // The code sets the order of sources too: the first added comes first.
    .orderBy(asc(careerSources.createdAt), asc(careerSources.id));

  const byCompany = new Map<string, CompanySource[]>();
  // The company's last check is the latest among its sources.
  const lastChecked = new Map<string, Date>();

  for (const {
    companyId,
    lastCheckedAt,
    consecutiveFailures,
    ...source
  } of sources) {
    const list = byCompany.get(companyId) ?? [];
    list.push({
      ...source,
      // A failed last check is one after which the failure counter is not zero.
      lastCheck:
        lastCheckedAt === null
          ? null
          : consecutiveFailures > 0
            ? "failed"
            : "ok",
    });
    byCompany.set(companyId, list);

    const latest = lastChecked.get(companyId);
    if (
      lastCheckedAt !== null &&
      (latest === undefined || lastCheckedAt > latest)
    ) {
      lastChecked.set(companyId, lastCheckedAt);
    }
  }

  const counts = await countVacancies(
    db,
    rows.map((row) => row.id),
  );

  return rows.map((row) => ({
    ...row,
    sources: byCompany.get(row.id) ?? [],
    vacancies: counts.get(row.id) ?? { total: 0, favorites: 0 },
    lastCheckedAt: lastChecked.get(row.id) ?? null,
  }));
}

/** Company vacancies: total and in Favorites, across all of each company's sources. */
async function countVacancies(
  db: NodePgDatabase,
  companyIds: string[],
): Promise<Map<string, CompanyListItem["vacancies"]>> {
  const rows = await db
    .select({
      companyId: careerSources.companyId,
      total: count(),
      favorites: count(sql`case when ${vacancies.isFavorite} then 1 end`),
    })
    .from(vacancies)
    .innerJoin(careerSources, eq(vacancies.sourceId, careerSources.id))
    .where(inArray(careerSources.companyId, companyIds))
    .groupBy(careerSources.companyId);

  return new Map(
    rows.map(({ companyId, total, favorites }) => [
      companyId,
      { total, favorites },
    ]),
  );
}

/**
 * How many companies each tab has. All the numbers are in the tab names at
 * once, so they are counted in one query. `attention` is also the number in the
 * menu next to Companies.
 */
export async function countCompaniesByTab(
  db: NodePgDatabase,
  userId: string,
): Promise<{
  tracked: number;
  notTracked: number;
  attention: number;
  all: number;
}> {
  const [row] = await db
    .select({
      tracked: count(sql`case when ${tabCondition(db, "tracked")} then 1 end`),
      notTracked: count(
        sql`case when ${tabCondition(db, "not-tracked")} then 1 end`,
      ),
      attention: count(
        sql`case when ${tabCondition(db, "attention")} then 1 end`,
      ),
      all: count(),
    })
    .from(companies)
    .where(eq(companies.userId, userId));

  return row ?? { tracked: 0, notTracked: 0, attention: 0, all: 0 };
}

/**
 * One company of a tab, as the list shows it.
 *
 * Needed after Save in the Edit modal: the list replaces exactly this row
 * without rereading the page. `null` means "it is no longer on this tab": a
 * company without tracked sources moved to Not tracked, so the row has to go.
 */
export async function findCompanyInTab(
  db: NodePgDatabase,
  {
    userId,
    companyId,
    tab,
  }: { userId: string; companyId: string; tab: CompaniesTab },
): Promise<CompanyListItem | null> {
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      url: companies.url,
      discoveryStatus: companies.discoveryStatus,
    })
    .from(companies)
    .where(
      and(
        eq(companies.id, companyId),
        // The condition on the user is the access check: someone else's company
        // simply will not be found.
        eq(companies.userId, userId),
        tabCondition(db, tab),
      ),
    );

  const [company] = await attachDetails(db, rows);

  return company ?? null;
}
