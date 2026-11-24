/**
 * Позначки користувача на вакансії: Read і Favorite (docs/ui.md, розділ 4.1).
 *
 * Кожна дія змінює лише своє поле - назву, адресу й дати пише тільки перевірка
 * (README, «Одночасні зміни»). Вакансія шукається за користувачем через
 * компанію: id приходить із клієнта, і чужу змінити не вийде.
 */
import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
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
 * дія над зниклою вакансією нічого не робить, без помилки (README.md поруч).
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
 * вакансії немає.
 *
 * Закрита вакансія, прибрана з Favorites, не видаляється одразу: вона зникає з
 * усіх вкладок, а видаляє її наступна перевірка джерела - та й так прибирає
 * зниклу з сайту вакансію поза Favorites (`lifecycle.ts`). До того її може
 * повернути Undo (задача vacancy-undo-toast).
 *
 * `favoritedAt` - дата додавання, яку повертає Undo після Remove from
 * Favorites; без неї - момент першої зірочки.
 */
export async function setVacancyFavorite(
  db: NodePgDatabase,
  {
    userId,
    vacancyId,
    isFavorite,
    favoritedAt,
  }: VacancyRef & { isFavorite: boolean; favoritedAt?: Date },
): Promise<VacancyListItem | null> {
  if (!isUuid(vacancyId)) return null;

  const own = and(
    eq(vacancies.id, vacancyId),
    inArray(vacancies.sourceId, ownSources(db, userId)),
  );

  // Дата додавання - момент першої зірочки: повторне «додати» (подвійне
  // натискання, друга вкладка браузера) її не оновлює.
  await db
    .update(vacancies)
    .set({
      isFavorite,
      favoritedAt: !isFavorite
        ? null
        : (favoritedAt ?? sql`coalesce(${vacancies.favoritedAt}, now())`),
    })
    .where(own);

  return findVacancy(db, { userId, vacancyId });
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
 * Mark all as unread, крок 1: скільки вакансій у вкладці Read - число для
 * діалогу підтвердження (задача 6.18).
 */
export async function countRead(
  db: NodePgDatabase,
  { userId }: { userId: string },
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(vacancies)
    .where(
      and(
        inArray(vacancies.sourceId, ownSources(db, userId)),
        tabCondition("read"),
      ),
    );

  return row.count;
}

/**
 * Mark all as unread, крок 2: повертає в Unread усі вакансії вкладки Read і
 * каже, скільки повернуто (задача 6.18).
 *
 * Межі, як у `markAllRead`, немає: у вкладку Read потрапляє лише те, що людина
 * прочитала сама, перевірка туди нічого не додає. Вакансія, прочитана в іншій
 * вкладці, поки відкритий діалог, теж повернеться - а саме цього людина й
 * хотіла. Число в діалозі тоді на одиницю менше, ніж повернуто.
 */
export async function markAllUnread(
  db: NodePgDatabase,
  { userId }: { userId: string },
): Promise<number> {
  const marked = await db
    .update(vacancies)
    .set({ isRead: false })
    .where(
      and(
        inArray(vacancies.sourceId, ownSources(db, userId)),
        tabCondition("read"),
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
