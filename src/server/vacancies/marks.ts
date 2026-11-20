/**
 * Позначки користувача на вакансії: Read і Favorite (docs/ui.md, розділ 4.1).
 *
 * Кожна дія змінює лише своє поле - назву, адресу й дати пише тільки перевірка
 * (README, «Одночасні зміни»). Вакансія шукається за користувачем через
 * компанію: id приходить із клієнта, і чужу змінити не вийде.
 */
import { and, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { VacancyListItem } from "../../lib/vacancies/vacancy-list.ts";
import { careerSources, companies, vacancies } from "../db/schema.ts";
import { DB_TIME_PATTERN, dbTimeText } from "../db/time.ts";
import { isUuid } from "../../lib/uuid.ts";
import { tabCondition, VACANCY_ROW } from "./list.ts";

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
  if (!isUuid(vacancyId)) return null;

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
  if (!isUuid(vacancyId)) return null;

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
  if (!isUuid(vacancyId)) return null;

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
 * Mark all as read, крок 1: скільки вакансій у вкладці Unread (усіх, не лише
 * завантаженої порції) і межа дії `asOf` - поточний час бази з мікросекундами.
 *
 * Межа - `created_at`, момент запису рядка, а не дата виявлення: та - момент
 * старту перевірки, і перевірка, що йде, поки відкритий діалог, записала б
 * нові вакансії «заднім числом» (README, «Одночасні зміни»).
 */
export async function countUnread(
  db: NodePgDatabase,
  { userId }: { userId: string },
): Promise<{ count: number; asOf: string }> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      asOf: dbTimeText(sql`now()`),
    })
    .from(vacancies)
    .where(
      and(
        inArray(vacancies.sourceId, ownSources(db, userId)),
        tabCondition("unread"),
      ),
    );

  return { count: row.count, asOf: row.asOf };
}

/**
 * Mark all as read, крок 2: позначає прочитаними вакансії вкладки Unread,
 * записані не пізніше межі з `countUnread`, і повертає, скільки позначено.
 * Записані пізніше - знайдені, поки був відкритий діалог, - лишаються Unread.
 * Межа приходить із клієнта: не час бази - нічого не робимо.
 */
export async function markAllRead(
  db: NodePgDatabase,
  { userId, asOf }: { userId: string; asOf: string },
): Promise<number> {
  if (!DB_TIME_PATTERN.test(asOf)) return 0;

  const marked = await db
    .update(vacancies)
    .set({ isRead: true })
    .where(
      and(
        inArray(vacancies.sourceId, ownSources(db, userId)),
        tabCondition("unread"),
        lte(vacancies.createdAt, sql`${asOf}::timestamptz`),
      ),
    )
    .returning({ id: vacancies.id });

  return marked.length;
}

/**
 * Mark all as read / Mark all as unread для компанії (docs/ui.md, розділ 4.2):
 * змінює `is_read` усіх активних (не Closed) вакансій її джерел і повертає,
 * скільки змінено. Діалогу й межі немає: дію легко скасувати протилежною.
 * Чужа компанія або id не у формі UUID - нічого не змінюється.
 */
export async function setCompanyVacanciesRead(
  db: NodePgDatabase,
  {
    userId,
    companyId,
    isRead,
  }: { userId: string; companyId: string; isRead: boolean },
): Promise<number> {
  if (!isUuid(companyId)) return 0;

  const companySources = db
    .select({ id: careerSources.id })
    .from(careerSources)
    .innerJoin(companies, eq(careerSources.companyId, companies.id))
    .where(and(eq(companies.id, companyId), eq(companies.userId, userId)));

  const changed = await db
    .update(vacancies)
    .set({ isRead })
    .where(
      and(
        inArray(vacancies.sourceId, companySources),
        isNull(vacancies.closedAt),
      ),
    )
    .returning({ id: vacancies.id });

  return changed.length;
}
