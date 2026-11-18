/**
 * Позначки користувача на вакансії: Read і Favorite (docs/ui.md, розділ 4.1).
 *
 * Кожна дія змінює лише своє поле - назву, адресу й дати пише тільки перевірка
 * (README, «Одночасні зміни»). Вакансія шукається за користувачем через
 * компанію: id приходить із клієнта, і чужу змінити не вийде.
 */
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { VacancyListItem } from "../../lib/vacancies/vacancy-list.ts";
import { careerSources, companies, vacancies } from "../db/schema.ts";
import { tabCondition, VACANCY_ROW } from "./list.ts";

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

/**
 * Favorite / Remove from Favorites. Повертає оновлений рядок або `null`, якщо
 * вакансії немає - зокрема коли вона щойно видалена.
 *
 * Закрита вакансія жила лише заради Favorites, тож прибрана звідти -
 * видаляється (розділ 7 плану). Рішення ухвалює база за поточним станом
 * рядка, а не клієнт за тим, що бачив у списку: `closed_at is not null` в умові
 * `delete`. Якщо перевірка саме зняла Closed, бо вакансія повернулася на сайт,
 * PostgreSQL перевірить умову на оновленому рядку, і вакансія лишиться - лише
 * без Favorite (README, «Одночасні зміни»).
 */
export async function setVacancyFavorite(
  db: NodePgDatabase,
  { userId, vacancyId, isFavorite }: VacancyRef & { isFavorite: boolean },
): Promise<VacancyListItem | null> {
  if (!UUID_PATTERN.test(vacancyId)) return null;

  return db.transaction(async (tx) => {
    const own = and(
      eq(vacancies.id, vacancyId),
      inArray(vacancies.sourceId, ownSources(tx, userId)),
    );

    if (!isFavorite) {
      await tx.delete(vacancies).where(and(own, isNotNull(vacancies.closedAt)));
    }

    await tx.update(vacancies).set({ isFavorite }).where(own);

    return findVacancy(tx, { userId, vacancyId });
  });
}

/**
 * ID усіх вакансій вкладки Unread користувача - не лише завантаженої порції.
 *
 * Це знімок для Mark all as read (docs/ui.md, розділ 4.1): діалог показує,
 * скільки їх, а дія позначає рівно ці. Межа - саме перелік, а не дата
 * виявлення: `first_detected_at` - момент старту перевірки, і перевірка, що
 * йде під час діалогу, вставила б нові вакансії «заднім числом» - вони мовчки
 * стали б прочитаними (README, «Одночасні зміни»).
 */
export async function listUnreadIds(
  db: NodePgDatabase,
  { userId }: { userId: string },
): Promise<string[]> {
  const rows = await db
    .select({ id: vacancies.id })
    .from(vacancies)
    .where(
      and(
        inArray(vacancies.sourceId, ownSources(db, userId)),
        tabCondition("unread"),
      ),
    );

  return rows.map((row) => row.id);
}
