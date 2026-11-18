/**
 * Списки вакансій для сторінки Jobs (docs/ui.md, розділ 4.1).
 */
import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type {
  JobsTab,
  VacancyListItem,
} from "../../lib/vacancies/vacancy-list.ts";
import { parseCursor, type Cursor } from "../../lib/pagination/cursor.ts";
import { careerSources, companies, vacancies } from "../db/schema.ts";

/**
 * Поля рядка списку Jobs (`VacancyListItem`). Спільні для списку й для рядка,
 * який повертає дія над вакансією (`marks.ts`): інакше два місця розходилися б.
 * Назва компанії потребує join «вакансія → джерело → компанія».
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
  closedAt: vacancies.closedAt,
};

/** Скільки вакансій показуємо одразу. Далі - Load more тією самою порцією. */
export const DEFAULT_LIMIT = 50;

/**
 * Порція списку й курсор наступної. `nextCursor` є лише тоді, коли далі справді
 * щось є.
 */
export type VacancyListPage = {
  items: VacancyListItem[];
  nextCursor: Cursor | null;
};

/**
 * Ключ курсора - дата виявлення точно так, як її зберігає база: ISO з
 * мікросекундами. JS `Date` тримає лише мілісекунди, тож курсор, зібраний з
 * нього, губив би мікросекунди, і рядок на межі порції приходив би вдруге.
 */
const CURSOR_KEY = sql<string>`to_char(${vacancies.firstDetectedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/** Форма ключа, яку дає `CURSOR_KEY`: усе інше - непридатний курсор. */
const CURSOR_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

/**
 * Умова вкладки. Активна вакансія - без позначки Closed; Closed буває лише у
 * Favorites, бо звичайна зникла вакансія видаляється (README, «Життєвий цикл»).
 */
function tabCondition(tab: JobsTab): SQL | undefined {
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
 * Порція вакансій однієї вкладки для одного користувача, від найновішої дати
 * виявлення.
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
     * Курсор останнього показаного рядка. Приходить із клієнта, тож непридатний
     * означає «почни з початку», а не помилку - як у списку компаній.
     */
    after?: Cursor | null;
  },
): Promise<VacancyListPage> {
  const parsed = parseCursor(after);
  const cursor =
    parsed !== null && CURSOR_KEY_PATTERN.test(parsed.key) ? parsed : null;

  const rows = await db
    .select({ ...VACANCY_ROW, cursorKey: CURSOR_KEY })
    .from(vacancies)
    // Користувач - лише через компанію: у вакансії власного `user_id` немає.
    .innerJoin(careerSources, eq(vacancies.sourceId, careerSources.id))
    .innerJoin(companies, eq(careerSources.companyId, companies.id))
    .where(
      and(
        eq(companies.userId, userId),
        tabCondition(tab),
        // Порівняння пари - рівно «наступний рядок за тим самим порядком»,
        // як у списку компаній, лише в бік старіших.
        cursor
          ? sql`(${vacancies.firstDetectedAt}, ${vacancies.id}) < (${cursor.key}::timestamptz, ${cursor.id}::uuid)`
          : undefined,
      ),
    )
    // `id` робить порядок однозначним при однаковій даті: одна перевірка дає
    // всім вакансіям джерела той самий момент виявлення.
    .orderBy(desc(vacancies.firstDetectedAt), desc(vacancies.id))
    // Один рядок понад порцію показує, чи є що читати далі.
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const visible = hasMore ? rows.slice(0, limit) : rows;
  const last = visible.at(-1);

  return {
    // Ключ курсора - службове поле запиту, у рядок списку він не йде.
    items: visible.map((row) => {
      const item: VacancyListItem & { cursorKey?: string } = { ...row };
      delete item.cursorKey;
      return item;
    }),
    nextCursor: hasMore && last ? { key: last.cursorKey, id: last.id } : null,
  };
}

/**
 * Чи є в користувача хоч одна вакансія. Від цього залежить текст порожньої
 * вкладки: «вакансій ще немає» з кнопкою Add company чи «усе прочитано».
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
