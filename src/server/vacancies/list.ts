/**
 * Списки вакансій для сторінки Jobs (docs/ui.md, розділ 4.1).
 */
import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type {
  JobsTab,
  VacancyListItem,
} from "../../lib/vacancies/vacancy-list.ts";
import { careerSources, companies, vacancies } from "../db/schema.ts";

/** Скільки вакансій показуємо одразу. Далі - Load more тією самою порцією. */
export const DEFAULT_LIMIT = 50;

export type VacancyListPage = {
  items: VacancyListItem[];
};

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
  }: {
    userId: string;
    tab: JobsTab;
    limit?: number;
  },
): Promise<VacancyListPage> {
  const items = await db
    .select({
      id: vacancies.id,
      title: vacancies.title,
      url: vacancies.url,
      location: vacancies.location,
      companyName: companies.name,
      firstDetectedAt: vacancies.firstDetectedAt,
      isRead: vacancies.isRead,
      isFavorite: vacancies.isFavorite,
      closedAt: vacancies.closedAt,
    })
    .from(vacancies)
    // Користувач - лише через компанію: у вакансії власного `user_id` немає.
    .innerJoin(careerSources, eq(vacancies.sourceId, careerSources.id))
    .innerJoin(companies, eq(careerSources.companyId, companies.id))
    .where(and(eq(companies.userId, userId), tabCondition(tab)))
    // `id` робить порядок однозначним при однаковій даті - саме так
    // сортуватиме й курсор.
    .orderBy(desc(vacancies.firstDetectedAt), desc(vacancies.id))
    .limit(limit);

  return { items };
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
