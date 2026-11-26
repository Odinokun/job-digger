"use client";

import { Button, Spinner } from "@heroui/react";
import { useNow } from "next-intl";
import Link from "next/link";
import { useCallback, useOptimistic, useState, useTransition } from "react";

import { useActionFailedToast } from "@/app/components/use-action-failed-toast";
import type { Cursor } from "@/lib/pagination/cursor";
import {
  adjustTabCounts,
  belongsToJobsTab,
  countNewVacancies,
  isRecentFavorite,
  patchVacancy,
  placeVacancy,
  type JobsTab,
  type JobsTabCounts,
  type VacancyListItem,
  type VacancyPatch,
} from "@/lib/vacancies/vacancy-list";

import {
  loadMoreVacanciesAction,
  setVacancyFavoriteAction,
  setVacancyReadAction,
} from "./actions";
import { JobsTabs } from "./jobs-tabs";
import { MarkAll } from "./mark-all";
import { useNewVacanciesNotice } from "./new-vacancies-notice";
import { useUndoNotice } from "./undo-notice";
import { VacancyRow } from "./vacancy-row";

interface JobsBoardProps {
  tab: JobsTab;
  title: string;
  tabsLabel: string;
  tabLabels: Record<JobsTab, string>;
  /**
   * How many rows each tab has, as the server knows it. Fresh numbers arrive
   * with the re-read page after every action (`revalidateHeaderCounts`).
   */
  counts: JobsTabCounts;
  /**
   * The first batch: the server renders it, so the list is visible without
   * JavaScript. When the page is re-read (`router.refresh` from polling or an
   * action), a fresh batch arrives here, while the shown list stays in state -
   * see `useNewVacanciesNotice`.
   */
  initialItems: VacancyListItem[];
  initialCursor: Cursor | null;
  emptyLabel: string;
  /** The button to Companies - only when there are no vacancies at all, not per tab. */
  addCompanyLabel: string | null;
  loadMoreLabel: string;
  /** Group headings in Favorites: added in the last 12 hours, and earlier. */
  favoriteGroupLabels: { recent: string; earlier: string };
}

/**
 * The Jobs page as a whole: the heading, the tabs and the list with Load more.
 *
 * The shown rows and the cursor live here, as in
 * [`companies-board.tsx`](../companies/companies-board.tsx). State does not leak
 * between tabs: the `key` on this component is the tab.
 */
export function JobsBoard({
  tab,
  title,
  tabsLabel,
  tabLabels,
  counts,
  initialItems,
  initialCursor,
  emptyLabel,
  addCompanyLabel,
  loadMoreLabel,
  favoriteGroupLabels,
}: JobsBoardProps) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);

  /**
   * An empty shown list takes the fresh batch by itself (task 6.29): nothing can
   * move, so a toast with Show is unnecessary. The batch from the server is the
   * same truth as after switching to the tab. The state is adjusted to the prop
   * during render, without an effect
   * (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
   */
  const [seenInitialItems, setSeenInitialItems] = useState(initialItems);
  if (initialItems !== seenInitialItems) {
    setSeenInitialItems(initialItems);
    if (items.length === 0 && initialItems.length > 0) {
      setItems(initialItems);
      setCursor(initialCursor);
    }
  }
  const [isPending, startTransition] = useTransition();
  // A separate transition for Read and Favorite: otherwise the Load more button
  // would spin while an action on a row is running.
  const [, startMark] = useTransition();
  const showActionFailed = useActionFailedToast();

  /**
   * The optimistic list: a Read or Favorite action shows at once, before the
   * server answers. While the action runs, React shows `items` with the change
   * applied; when it ends, `items` alone again. So on failure the row goes back
   * by itself, because `items` updates only on success
   * (https://react.dev/reference/react/useOptimistic).
   */
  const [shown, addPatch] = useOptimistic(items, patchVacancy);

  /**
   * After an action the row replaces its previous version in the same place -
   * the discovery date the list is sorted by does not change with actions. If the
   * vacancy no longer belongs to the tab (read in Unread, removed from Favorites)
   * or is gone, the row is removed.
   */
  const applyRow = useCallback(
    (vacancyId: string, changed: VacancyListItem | null) => {
      setItems((shown) =>
        changed !== null && belongsToJobsTab(changed, tab)
          ? shown.map((item) => (item.id === vacancyId ? changed : item))
          : shown.filter((item) => item.id !== vacancyId),
      );
    },
    [tab],
  );

  /**
   * Undo: gives the vacancy back the marks it had before the action, together
   * with the date it was added to favorites, so it does not jump into the recent
   * favorites. The row goes back to its place in the tab order (`placeVacancy`):
   * in Unread or Favorites it has already been removed from the list.
   */
  const undo = useCallback(
    (before: VacancyListItem, patch: VacancyPatch) => {
      startMark(async () => {
        const result =
          patch.changes.isRead !== undefined
            ? await setVacancyReadAction(before.id, before.isRead)
            : await setVacancyFavoriteAction(
                before.id,
                before.isFavorite,
                before.favoritedAt,
              );

        if (!result.ok) {
          showActionFailed();
          return;
        }

        const row = result.vacancy;
        if (row !== null) {
          startMark(() => setItems((list) => placeVacancy(list, row, tab)));
        }
      });
    },
    [tab, showActionFailed],
  );

  const showUndo = useUndoNotice();

  /** Read or Favorite for a row: at once in the UI, then on the server. */
  const mark = useCallback(
    (patch: VacancyPatch) => {
      const before = items.find((item) => item.id === patch.id);

      startMark(async () => {
        addPatch(patch);

        const { isRead, isFavorite } = patch.changes;
        const result =
          isRead !== undefined
            ? await setVacancyReadAction(patch.id, isRead)
            : await setVacancyFavoriteAction(patch.id, isFavorite);

        if (!result.ok) {
          showActionFailed();
          return;
        }

        // After `await` a state update is no longer part of the transition
        // (https://react.dev/reference/react/useTransition#react-doesnt-treat-my-state-update-after-await-as-a-transition).
        // Inside a transition the row is applied in one frame with the fresh tab
        // numbers from the re-read page; otherwise the number would briefly jump
        // back to the old one.
        startMark(() => applyRow(patch.id, result.vacancy));

        // Undo only for Mark as read and Remove from Favorites: those are the
        // actions that remove the row from the tab.
        if (before !== undefined && (isRead === true || isFavorite === false)) {
          showUndo({
            action: isRead === true ? "markedRead" : "removedFromFavorites",
            title: before.title,
            onUndo: () => undo(before, patch),
          });
        }
      });
    },
    [items, addPatch, applyRow, showActionFailed, showUndo, undo],
  );

  // A row the action took out of the tab disappears at once, before the server answers.
  const visible = shown.filter((vacancy) => belongsToJobsTab(vacancy, tab));
  /**
   * Favorites splits into those added in the last 12 hours and earlier (task
   * favorites-added-today): the list is already ordered by date added, so
   * headings show the boundary, with no mark on each row. No recent ones - no
   * headings. "Now" is shared by server and client through next-intl, so the
   * boundary does not shift during hydration.
   */
  const now = useNow();
  const recent =
    tab === "favorites"
      ? visible.filter((vacancy) => isRecentFavorite(vacancy, now))
      : [];
  const groups =
    recent.length === 0
      ? [{ label: null, items: visible }]
      : [
          { label: favoriteGroupLabels.recent, items: recent },
          {
            label: favoriteGroupLabels.earlier,
            items: visible.filter((vacancy) => !recent.includes(vacancy)),
          },
        ].filter((group) => group.items.length > 0);
  // Tab numbers move together with the row, not after the server answers.
  const shownCounts = adjustTabCounts(counts, items, shown);

  const loadMore = useCallback(() => {
    if (!cursor) {
      return;
    }

    startTransition(async () => {
      const result = await loadMoreVacanciesAction(tab, cursor);

      if (!result.ok) {
        showActionFailed();
        return;
      }

      setItems((shown) => [...shown, ...result.items]);
      setCursor(result.nextCursor);
    });
  }, [cursor, tab, showActionFailed]);

  /**
   * After Mark all as read, none of the unread vacancies in the list are left:
   * every shown row was recorded before the action's boundary. Ones found later
   * fill the emptied list by themselves (task 6.29).
   */
  const clearList = useCallback(() => {
    setItems([]);
    setCursor(null);
  }, []);

  /**
   * New vacancies do not merge into the list by themselves (task 4.13):
   * `router.refresh` brings a fresh first batch in the props, while the list
   * state stays. Show re-reads the tab from the first batch - exactly this fresh
   * batch.
   */
  const newCount = countNewVacancies(items, initialItems, tab);
  const showNew = useCallback(() => {
    setItems(initialItems);
    setCursor(initialCursor);
  }, [initialItems, initialCursor]);

  useNewVacanciesNotice({
    count: newCount,
    hasMore: newCount === initialItems.length && initialCursor !== null,
    onShow: showNew,
  });

  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        {title}
      </h1>

      <div className="mt-4">
        <JobsTabs
          current={tab}
          label={tabsLabel}
          labels={tabLabels}
          counts={shownCounts}
        />
      </div>

      {(tab === "unread" || tab === "read") && visible.length > 0 ? (
        <div className="mt-4 flex justify-end">
          <MarkAll
            target={tab === "unread" ? "read" : "unread"}
            onMarked={clearList}
          />
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="mt-6 flex flex-col items-start gap-3">
          <p className="text-sm text-muted">{emptyLabel}</p>
          {addCompanyLabel === null ? null : (
            // A link, not a button with a modal: Add company lives on the
            // Companies page, next to the company list.
            <Link
              href="/companies"
              className="text-sm font-medium underline underline-offset-2"
            >
              {addCompanyLabel}
            </Link>
          )}
        </div>
      ) : (
        <>
          {groups.map((group) => (
            <section key={group.label ?? "all"}>
              {group.label === null ? null : (
                <h2 className="mt-6 text-sm font-semibold">{group.label}</h2>
              )}
              <ul className="mt-2 divide-y">
                {group.items.map((vacancy) => (
                  <li key={vacancy.id}>
                    <VacancyRow vacancy={vacancy} onMark={mark} />
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {cursor === null ? null : (
            <div className="mt-6 flex justify-center">
              <Button
                variant="secondary"
                isPending={isPending}
                onPress={loadMore}
              >
                {/* HeroUI `isPending` only disables the button - we draw the
                    spinner ourselves, as in the Loading example of the Button docs. */}
                {({ isPending: isLoading }) => (
                  <>
                    {isLoading ? <Spinner color="current" size="sm" /> : null}
                    {loadMoreLabel}
                  </>
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
