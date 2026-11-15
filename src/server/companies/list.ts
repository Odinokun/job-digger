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

/**
 * Вкладки сторінки Companies. Належність до вкладки в базі не зберігається:
 * Tracked - це «є хоч одне джерело, що відстежується» (docs/ui.md, розділи 4.2 і 4.3).
 */
export type CompaniesTab = "tracked" | "not-tracked";

/**
 * Скільки компаній показуємо одразу. Далі - Load more тією самою порцією,
 * і сам механізм пагінації приходить із задачею 2.10 (docs/ui.md, розділ 4.2).
 */
export const DEFAULT_LIMIT = 50;

export type CompanySource = {
  id: string;
  url: string;
  platform: (typeof careerSources.$inferSelect)["platform"];
  isTracked: boolean;
};

export type CompanyListItem = {
  id: string;
  name: string;
  url: string;
  discoveryStatus: (typeof companies.$inferSelect)["discoveryStatus"];
  sources: CompanySource[];
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
 * Компанії однієї вкладки для одного користувача.
 */
export async function listCompanies(
  db: NodePgDatabase,
  {
    userId,
    tab,
    limit = DEFAULT_LIMIT,
  }: { userId: string; tab: CompaniesTab; limit?: number },
): Promise<CompanyListItem[]> {
  const tracked = trackedSourceSubquery(db, companies.id);

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
      ),
    )
    // Порядок задає код, а не база: список читається за алфавітом назв.
    .orderBy(asc(companies.name))
    .limit(limit);

  return attachSources(db, rows);
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
