import {
  and,
  asc,
  count,
  eq,
  exists,
  inArray,
  notExists,
  sql,
} from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { careerSources, companies } from "../db/schema.ts";
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
  const tracked = trackedSourceSubquery(db, companies.id);
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
        tab === "tracked" ? exists(tracked) : notExists(tracked),
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
    items: await attachSources(db, visible),
    nextCursor: hasMore && last ? { key: last.name, id: last.id } : null,
  };
}

/**
 * Дотягує джерела показаних компаній другим запитом.
 *
 * Окремий запит, а не join: join дублював би рядок компанії на кожне джерело,
 * а агрегація в json зробила б запит помітно складнішим заради того самого
 * результату на півсотні рядків.
 */
async function attachSources(
  db: NodePgDatabase,
  rows: Omit<CompanyListItem, "sources">[],
): Promise<CompanyListItem[]> {
  if (rows.length === 0) {
    return [];
  }

  const sources = await db
    .select({
      id: careerSources.id,
      companyId: careerSources.companyId,
      url: careerSources.url,
      platform: careerSources.platform,
      isTracked: careerSources.isTracked,
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

  for (const { companyId, ...source } of sources) {
    const list = byCompany.get(companyId) ?? [];
    list.push(source);
    byCompany.set(companyId, list);
  }

  return rows.map((row) => ({ ...row, sources: byCompany.get(row.id) ?? [] }));
}

/**
 * Скільки компаній у кожній вкладці. Обидва числа стоять у назвах вкладок
 * одночасно, тому рахуються одним запитом.
 */
export async function countCompaniesByTab(
  db: NodePgDatabase,
  userId: string,
): Promise<{ tracked: number; notTracked: number }> {
  const tracked = trackedSourceSubquery(db, companies.id);

  const [row] = await db
    .select({
      tracked: count(sql`case when ${exists(tracked)} then 1 end`),
      notTracked: count(sql`case when ${notExists(tracked)} then 1 end`),
    })
    .from(companies)
    .where(eq(companies.userId, userId));

  return row ?? { tracked: 0, notTracked: 0 };
}
