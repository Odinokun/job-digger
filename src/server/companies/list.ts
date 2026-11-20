import {
  and,
  asc,
  count,
  eq,
  exists,
  gte,
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
 * Скільки компаній показуємо одразу. Далі - Load more тією самою порцією.
 */
export const DEFAULT_LIMIT = 50;

/**
 * Порція списку: самі компанії і те, звідки читати наступну.
 *
 * `nextCursor` є лише тоді, коли далі справді щось є, тому кнопка Load more
 * не питає базу, щоб дізнатися, що показувати більше нічого.
 */
export type CompanyListPage = {
  items: CompanyListItem[];
  nextCursor: Cursor | null;
};

/**
 * Підзапит «у цієї компанії є відстежуване джерело».
 *
 * Будується через query builder, а не сирим `sql`: тоді Drizzle сам огортає
 * підзапит дужками, яких `exists` не додає.
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
 * Скільки невдач поспіль робить джерело проблемою для Needs attention. Одна -
 * мережа моргнула, смикати користувача не варто (задача 6.11).
 */
export const ATTENTION_FAILURES = 2;

/**
 * Підзапит «компанія потребує уваги» (задача 6.11): є сторінка, яку ми не
 * читаємо (`unsupported`, у Tracked чи Not tracked), або відстежуване джерело
 * падає `ATTENTION_FAILURES` разів поспіль і більше. Збій сторінки без
 * відстеження не рахується - її не перевіряють.
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
          eq(careerSources.platform, "unsupported"),
          and(
            eq(careerSources.isTracked, true),
            gte(careerSources.consecutiveFailures, ATTENTION_FAILURES),
          ),
        ),
      ),
    );
}

/** Умова належності компанії до вкладки. */
function tabCondition(db: NodePgDatabase, tab: CompaniesTab): SQL {
  if (tab === "attention") {
    return exists(needsAttentionSubquery(db, companies.id));
  }

  const tracked = trackedSourceSubquery(db, companies.id);

  return tab === "tracked" ? exists(tracked) : notExists(tracked);
}

/**
 * Порція компаній однієї вкладки для одного користувача.
 *
 * `after` - курсор останнього показаного рядка; без нього читається початок
 * списку. Значення приходить із клієнта, тому проходить `parseCursor`:
 * непридатний курсор означає «почни з початку», а не помилку.
 */
export async function listCompanies(
  db: NodePgDatabase,
  {
    userId,
    tab,
    limit = DEFAULT_LIMIT,
    after,
  }: {
    userId: string;
    tab: CompaniesTab;
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
        // Порівняння пари, а не двох умов через OR: у PostgreSQL
        // `(a, b) > (x, y)` - це рівно «наступний рядок за тим самим
        // порядком», і воно збігається з `ORDER BY name, id`.
        cursor
          ? sql`(${companies.name}, ${companies.id}) > (${cursor.key}, ${cursor.id}::uuid)`
          : undefined,
      ),
    )
    // Порядок задає код, а не база: список читається за алфавітом назв, а `id`
    // робить порядок однозначним при однакових назвах - без цього курсор
    // губив би рядки на межі порції.
    .orderBy(asc(companies.name), asc(companies.id))
    // Один рядок понад порцію - дешевший спосіб дізнатися, що далі ще є, ніж
    // окремий `count` на кожне Load more.
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
 * Дотягує до показаних компаній джерела й числа вакансій - окремими запитами.
 *
 * Окремі запити, а не join: join дублював би рядок компанії на кожне джерело,
 * а агрегація в json зробила б запит помітно складнішим заради того самого
 * результату на півсотні рядків.
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
      lastCheckedAt: careerSources.lastCheckedAt,
      lastSuccessAt: careerSources.lastSuccessAt,
      consecutiveFailures: careerSources.consecutiveFailures,
      // Джерело в черзі - Checking у статусі компанії. Завдань у черзі на
      // джерело - одиниці, а індекс `check_tasks_source_idx` є.
      //
      // Імена таблиць - явно: у запиті з однієї таблиці Drizzle пише колонки
      // без них, і всередині підзапиту `"source_id" = "id"` порівнювало б
      // колонки самої `check_tasks`.
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
    // Порядок джерел теж задає код: спершу додане - першим.
    .orderBy(asc(careerSources.createdAt), asc(careerSources.id));

  const byCompany = new Map<string, CompanySource[]>();
  // Остання перевірка компанії - найпізніша серед її джерел.
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
      // Невдала остання перевірка - та, після якої лічильник збоїв не нуль.
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

/** Вакансії компаній: усього й у Favorites, по всіх джерелах кожної. */
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
 * Скільки компаній у кожній вкладці. Усі числа стоять у назвах вкладок
 * одночасно, тому рахуються одним запитом. `attention` - ще й число в меню біля
 * Companies.
 */
export async function countCompaniesByTab(
  db: NodePgDatabase,
  userId: string,
): Promise<{ tracked: number; notTracked: number; attention: number }> {
  const [row] = await db
    .select({
      tracked: count(sql`case when ${tabCondition(db, "tracked")} then 1 end`),
      notTracked: count(
        sql`case when ${tabCondition(db, "not-tracked")} then 1 end`,
      ),
      attention: count(
        sql`case when ${tabCondition(db, "attention")} then 1 end`,
      ),
    })
    .from(companies)
    .where(eq(companies.userId, userId));

  return row ?? { tracked: 0, notTracked: 0, attention: 0 };
}

/**
 * Одна компанія вкладки - такою, якою її показує список.
 *
 * Потрібна після Save у модалці Edit: список замінює в себе саме цей рядок,
 * не перечитуючи порції. `null` означає «на цій вкладці її більше немає» -
 * компанія без відстежуваних джерел переїхала в Not tracked, тож рядок треба
 * прибрати.
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
        // Умова на користувача тут і є перевіркою доступу: чужа компанія
        // просто не знайдеться.
        eq(companies.userId, userId),
        tabCondition(db, tab),
      ),
    );

  const [company] = await attachDetails(db, rows);

  return company ?? null;
}
