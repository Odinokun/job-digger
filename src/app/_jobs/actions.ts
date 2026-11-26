"use server";

import { runAction } from "@/app/action-result";
import { revalidateHeaderCounts } from "@/app/components/header-counts";
import type { Cursor } from "@/lib/pagination/cursor";
import {
  parseJobsTab,
  type VacancyListItem,
} from "@/lib/vacancies/vacancy-list";
import { getDb } from "@/server/db/client";
import { getSystemUser } from "@/server/db/system-user";
import { listVacancies } from "@/server/vacancies/list";
import {
  countRead,
  countUnread,
  markAllRead,
  markAllUnread,
  setVacancyFavorite,
  setVacancyRead,
} from "@/server/vacancies/marks";

/** The next batch of a Jobs tab, or the fact of a failure - nothing to show it with but a toast. */
export type LoadMoreVacanciesResult =
  | { ok: true; items: VacancyListItem[]; nextCursor: Cursor | null }
  | { ok: false };

/**
 * Load more on the Jobs page.
 *
 * The arguments are untrusted input: a Server Action can be reached with a
 * direct POST request. `parseJobsTab` parses the tab, `listVacancies` the
 * cursor, and the user is taken on the server.
 */
export async function loadMoreVacanciesAction(
  tab: unknown,
  after: unknown,
): Promise<LoadMoreVacanciesResult> {
  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    return listVacancies(db, {
      userId: user.id,
      tab: parseJobsTab(tab),
      after: after as Cursor | null,
    });
  });

  if (!outcome.ok) {
    return { ok: false };
  }

  return { ok: true, ...outcome.value };
}

/**
 * The vacancy row after an action, or the fact of a failure. `vacancy: null` -
 * the vacancy is gone (it left the site, or was deleted together with its closed
 * mark), and the list removes it.
 */
export type VacancyMarkResult =
  { ok: true; vacancy: VacancyListItem | null } | { ok: false };

/**
 * Mark as read / Mark as unread. The arguments are untrusted input:
 * `setVacancyRead` checks the id (UUID and owner), and the mark must be a boolean.
 */
export async function setVacancyReadAction(
  vacancyId: unknown,
  isRead: unknown,
): Promise<VacancyMarkResult> {
  if (typeof vacancyId !== "string" || typeof isRead !== "boolean") {
    return { ok: false };
  }

  return markResult(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    return setVacancyRead(db, { userId: user.id, vacancyId, isRead });
  });
}

/**
 * Favorite / Remove from Favorites - the same as Read. `favoritedAt` is the date
 * added that Undo restores after Remove from Favorites (task vacancy-undo-toast);
 * if present, it must be a real date or `null` (an old favorite without a date).
 */
export async function setVacancyFavoriteAction(
  vacancyId: unknown,
  isFavorite: unknown,
  favoritedAt?: unknown,
): Promise<VacancyMarkResult> {
  if (
    typeof vacancyId !== "string" ||
    typeof isFavorite !== "boolean" ||
    (favoritedAt !== undefined &&
      favoritedAt !== null &&
      !(favoritedAt instanceof Date && !Number.isNaN(favoritedAt.getTime())))
  ) {
    return { ok: false };
  }

  return markResult(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    return setVacancyFavorite(db, {
      userId: user.id,
      vacancyId,
      isFavorite,
      favoritedAt: favoritedAt as Date | null | undefined,
    });
  });
}

/**
 * The result of an action for a row. After a successful write the app is
 * marked stale (`revalidateHeaderCounts`) - for the header counter, and because
 * the row leaves the tab at once, before the write, so the user can switch to
 * another tab while the action is still running - and without this would see a
 * list read before the write there, without the vacancy just marked (task
 * 3.22). `revalidatePath` in a Server Function refreshes the page currently
 * shown and clears the client cache
 * (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md).
 */
async function markResult(
  work: () => Promise<VacancyListItem | null>,
): Promise<VacancyMarkResult> {
  const outcome = await runAction(work);

  if (outcome.ok) {
    revalidateHeaderCounts();
  }

  return outcome.ok ? { ok: true, vacancy: outcome.value } : { ok: false };
}

/**
 * Mark all as read, step 1: how many are unread and the boundary of the action.
 * The dialog shows the number, and step 2 marks those recorded up to the
 * boundary (`countUnread`).
 */
export async function countUnreadAction(): Promise<
  { ok: true; count: number; asOf: string } | { ok: false }
> {
  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    return countUnread(db, { userId: user.id });
  });

  return outcome.ok ? { ok: true, ...outcome.value } : { ok: false };
}

/**
 * Mark all as read, step 2. The boundary is untrusted input: not a string - a
 * refusal, and `markAllRead` simply does not run on a string that is not a
 * database timestamp.
 */
export async function markAllReadAction(
  asOf: unknown,
): Promise<{ ok: true; marked: number } | { ok: false }> {
  if (typeof asOf !== "string") {
    return { ok: false };
  }

  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    return markAllRead(db, { userId: user.id, asOf });
  });

  if (!outcome.ok) {
    return { ok: false };
  }

  revalidateHeaderCounts();

  return { ok: true, marked: outcome.value };
}

/**
 * Mark all as unread, step 1: how many vacancies the Read tab has - the number
 * for the dialog (task 6.18).
 */
export async function countReadAction(): Promise<
  { ok: true; count: number } | { ok: false }
> {
  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    return countRead(db, { userId: user.id });
  });

  return outcome.ok ? { ok: true, count: outcome.value } : { ok: false };
}

/**
 * Mark all as unread, step 2: every vacancy of the Read tab goes back to Unread.
 * There are no arguments, so no untrusted input either; there is deliberately no
 * boundary (`markAllUnread`).
 */
export async function markAllUnreadAction(): Promise<
  { ok: true; marked: number } | { ok: false }
> {
  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    return markAllUnread(db, { userId: user.id });
  });

  if (!outcome.ok) {
    return { ok: false };
  }

  revalidateHeaderCounts();

  return { ok: true, marked: outcome.value };
}
