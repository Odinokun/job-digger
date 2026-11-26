/**
 * The user's marks on a vacancy: Read and Favorite.
 *
 * Each action changes only its own field - only a check writes the title, the
 * address and the dates (README, "Concurrent changes"). The vacancy is looked up
 * by user through the company: the id comes from the client, and someone else's
 * cannot be changed.
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

/** The user's sources - the subquery actions limit their changes with. */
function ownSources(db: NodePgDatabase, userId: string) {
  return db
    .select({ id: careerSources.id })
    .from(careerSources)
    .innerJoin(companies, eq(careerSources.companyId, companies.id))
    .where(eq(companies.userId, userId));
}

/** The Jobs list row for one vacancy, or `null` if it does not exist or belongs to someone else. */
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
 * Mark as read / Mark as unread. Returns the updated row, or `null` if the vacancy
 * is gone (a check deleted it while the user was looking at the list) - an action
 * on a gone vacancy does nothing, without an error (the README.md next to this file).
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
 * Favorite / Remove from Favorites. Returns the updated row, or `null` if the
 * vacancy does not exist.
 *
 * A closed vacancy removed from Favorites is not deleted at once: it leaves every
 * tab, and the next check of the source deletes it - that check removes a vacancy
 * gone from the site outside Favorites anyway (`lifecycle.ts`). Until then Undo can
 * bring it back (task vacancy-undo-toast).
 *
 * `favoritedAt` is the date added that Undo restores after Remove from Favorites,
 * including the `null` of an old favorite without a date; without it - the moment
 * of the first star.
 */
export async function setVacancyFavorite(
  db: NodePgDatabase,
  {
    userId,
    vacancyId,
    isFavorite,
    favoritedAt,
  }: VacancyRef & { isFavorite: boolean; favoritedAt?: Date | null },
): Promise<VacancyListItem | null> {
  if (!isUuid(vacancyId)) return null;

  const own = and(
    eq(vacancies.id, vacancyId),
    inArray(vacancies.sourceId, ownSources(db, userId)),
  );

  // The date added is the moment of the first star: adding again (a double click, a
  // second browser tab) does not update it.
  await db
    .update(vacancies)
    .set({
      isFavorite,
      favoritedAt: !isFavorite
        ? null
        : favoritedAt === undefined
          ? sql`coalesce(${vacancies.favoritedAt}, now())`
          : favoritedAt,
    })
    .where(own);

  return findVacancy(db, { userId, vacancyId });
}

/**
 * Mark all as read, step 1: how many vacancies the Unread tab has (all of them, not
 * only the loaded batch) and the action's boundary `asOf` - the current database
 * time with microseconds.
 *
 * The boundary is `created_at`, the moment the row was written, not the discovery
 * date: that is the moment the check started, and a check running while the dialog
 * is open would write new vacancies "backdated" (README, "Concurrent changes").
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
 * Mark all as read, step 2: marks as read the vacancies of the Unread tab recorded
 * up to the boundary from `countUnread`, and returns how many were marked. Ones
 * recorded later - found while the dialog was open - stay Unread. The boundary comes
 * from the client: if it is not a database time, nothing is done.
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
 * Mark all as unread, step 1: how many vacancies the Read tab has - the number for
 * the confirmation dialog (task 6.18).
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
 * Mark all as unread, step 2: puts every vacancy of the Read tab back into Unread
 * and says how many were put back (task 6.18).
 *
 * There is no boundary, unlike `markAllRead`: only what the user read themselves
 * gets into the Read tab, and a check adds nothing there. A vacancy read in another
 * tab while the dialog is open comes back too - which is exactly what the user
 * wanted. The number in the dialog is then one less than the number put back.
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
 * Mark all as read / Mark all as unread for a company: changes `is_read` of all
 * active (not Closed) vacancies of its sources and returns how many were changed.
 * No dialog and no boundary: the opposite action undoes it easily. Another user's
 * company or an id that is not a UUID - nothing changes.
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
