/**
 * Позначки користувача на вакансії: Read і Favorite (docs/ui.md, розділ 4.1).
 *
 * Кожна дія змінює лише своє поле - назву, адресу й дати пише тільки перевірка
 * (README, «Одночасні зміни»). Вакансія шукається за користувачем через
 * компанію: id приходить із клієнта, і чужу змінити не вийде.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { VacancyListItem } from "../../lib/vacancies/vacancy-list.ts";
import { careerSources, companies, vacancies } from "../db/schema.ts";
import { VACANCY_ROW } from "./list.ts";

/**
 * Форма UUID. Id приходить аргументом Server Action, а криве значення в
 * колонці `uuid` - помилка бази, а не «не знайдено».
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface VacancyRef {
  userId: string;
  vacancyId: string;
}

/** Джерела користувача - підзапит, яким дії обмежують свої зміни. */
function ownSources(db: NodePgDatabase, userId: string) {
  return db
    .select({ id: careerSources.id })
    .from(careerSources)
    .innerJoin(companies, eq(careerSources.companyId, companies.id))
    .where(eq(companies.userId, userId));
}

/** Рядок списку Jobs для однієї вакансії або `null`, якщо її немає чи вона чужа. */
export async function findVacancy(
  db: NodePgDatabase,
  { userId, vacancyId }: VacancyRef,
): Promise<VacancyListItem | null> {
  if (!UUID_PATTERN.test(vacancyId)) return null;

  const [row] = await db
    .select(VACANCY_ROW)
    .from(vacancies)
    .innerJoin(careerSources, eq(vacancies.sourceId, careerSources.id))
    .innerJoin(companies, eq(careerSources.companyId, companies.id))
    .where(and(eq(vacancies.id, vacancyId), eq(companies.userId, userId)));

  return row ?? null;
}

/**
 * Mark as read / Mark as unread. Повертає оновлений рядок або `null`, якщо
 * вакансії вже немає (перевірка видалила її, поки користувач дивився список) -
 * дія над зниклою вакансією нічого не робить, без помилки (розділ 7 плану).
 */
export async function setVacancyRead(
  db: NodePgDatabase,
  { userId, vacancyId, isRead }: VacancyRef & { isRead: boolean },
): Promise<VacancyListItem | null> {
  if (!UUID_PATTERN.test(vacancyId)) return null;

  await db
    .update(vacancies)
    .set({ isRead })
    .where(
      and(
        eq(vacancies.id, vacancyId),
        inArray(vacancies.sourceId, ownSources(db, userId)),
      ),
    );

  return findVacancy(db, { userId, vacancyId });
}
