"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";

import { useCheckStatus } from "@/app/components/check-status-provider";
import { useActionFailedToast } from "@/app/components/use-action-failed-toast";
import { isBusy } from "@/lib/checks/status-poller";
import {
  compareCompanyRows,
  matchesCompanySearch,
  type CompaniesTab,
  type CompanyListItem,
  type CompanySource,
  type DiscoveryStatus,
} from "@/lib/companies/company-list";
import type { Cursor } from "@/lib/pagination/cursor";

import {
  checkCompanyNowAction,
  loadMoreCompaniesAction,
  reloadCompaniesAction,
} from "./actions";
import { AddCompanyDialog } from "./add-company-dialog";
import { CheckAllButton } from "./check-all-button";
import { FindNewPagesButton } from "./find-new-pages-button";
import { CompaniesList } from "./companies-list";
import { CompanySearch } from "./company-search";

interface CompaniesBoardProps {
  tab: CompaniesTab;
  title: string;
  /** The tabs with counters - a server component, so they arrive ready-made. */
  tabs: ReactNode;
  /** The first batch: the server renders it, so the list is visible without JavaScript. */
  initialItems: CompanyListItem[];
  initialCursor: Cursor | null;
  emptyLabel: string;
  /** The tab name - the hidden heading of the list, see `companies-list.tsx`. */
  listHeading: string;
  loadMoreLabel: string;
  noSourcesLabel: string;
  platformLabels: Record<CompanySource["platform"], string>;
  statusLabels: Record<DiscoveryStatus, string>;
  /** Whether Tracked has at least one company - otherwise Check all is disabled. */
  hasTracked: boolean;
  /** Whether Not tracked has at least one company - otherwise Find new pages is disabled. */
  hasNotTracked: boolean;
  /** The name search on the All tab; an empty string on the other tabs. */
  query: string;
  searchLabels: {
    open: string;
    field: string;
    placeholder: string;
    close: string;
  };
}

/**
 * The Companies page as a whole: the Add button, the tabs and the list.
 *
 * The shown rows live here, not in the list itself, because Add, Edit and Load
 * more all change them, side by side. If the state lived in the list, the Add
 * button on the page would have no way to reach it, and an added company would
 * appear only after a reload.
 *
 * A page refresh does not touch the list: it is built from its own state. So
 * every action returns the row it touched, and `revalidatePath` stays for the
 * tab counters, which are rendered on the server.
 *
 * State does not leak between tabs: the `key` on this component is the tab.
 */
export function CompaniesBoard({
  tab,
  title,
  tabs,
  initialItems,
  initialCursor,
  emptyLabel,
  listHeading,
  loadMoreLabel,
  noSourcesLabel,
  platformLabels,
  statusLabels,
  hasTracked,
  hasNotTracked,
  query,
  searchLabels,
}: CompaniesBoardProps) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);

  // A new search means a new list from the first batch. Not through `key`, as
  // with the tab: remounting would take focus off the search field mid-typing.
  // The state is reset during render when the prop changes
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const [shownQuery, setShownQuery] = useState(query);
  if (query !== shownQuery) {
    setShownQuery(query);
    setItems(initialItems);
    setCursor(initialCursor);
  }
  const [isPending, startTransition] = useTransition();
  // A new company whose card should start the first check by itself (task 5.09).
  const [firstCheckId, setFirstCheckId] = useState<string | null>(null);
  const showActionFailed = useActionFailedToast();
  const { status } = useCheckStatus();
  const isCheckRunning = status !== null && isBusy(status);
  const wasCheckRunning = useRef(false);
  const shownCount = items.length;

  // A general check or Find new pages has ended - statuses, "Last checked" and
  // the contents of the tabs have changed, while the rows live in state and do
  // not update themselves. Re-read as many as are shown, so as not to lose the
  // loaded batches.
  useEffect(() => {
    if (wasCheckRunning.current && !isCheckRunning) {
      void reloadCompaniesAction(tab, shownCount, query).then((result) => {
        if (!result.ok) return;
        setItems(result.items);
        setCursor(result.nextCursor);
      });
    }
    wasCheckRunning.current = isCheckRunning;
  }, [isCheckRunning, tab, shownCount, query]);

  /**
   * The row an action touched replaces its previous version.
   *
   * Only the row, not the whole list: a re-read would drop the loaded batches,
   * and a user who scrolled to the two-hundredth company would be back at the
   * first fifty. `null` means the company does not belong to this tab - the row
   * is removed (or not added).
   *
   * The name sets the alphabetical position, so what is shown is re-sorted in
   * the same order as the query. A company whose name comes after everything
   * loaded stays at the end of the list until the next read from the server puts
   * it in place. During a search, a row whose name does not match the search (a
   * company added or renamed in Edit) is removed too - the server would not have
   * shown it either.
   */
  const applyRow = useCallback(
    (companyId: string, row: CompanyListItem | null) => {
      setItems((shown) => {
        const without = shown.filter((company) => company.id !== companyId);

        return row && matchesCompanySearch(row.name, query)
          ? [...without, row].sort(compareCompanyRows)
          : without;
      });
    },
    [query],
  );

  /**
   * A deleted company is removed from the list: the same `applyRow` without a
   * row. A separate callback rather than `applyRow` directly, because the delete
   * dialog has nothing to return - the row is gone.
   */
  const removeRow = useCallback(
    (companyId: string) => {
      applyRow(companyId, null);
    },
    [applyRow],
  );

  /**
   * A new company: the row goes into the list, and the first check runs if there
   * is anything to check (src/app/README.md, "Adding a company").
   *
   * A visible card checks itself - with the Check now button and its spinner, as
   * after a click. If it is not visible (the company was added from the Not
   * tracked tab), the check runs without a button; the action's response updates
   * the Jobs counter.
   */
  const addRow = useCallback(
    (added: CompanyListItem | null, firstCheck: string | null) => {
      if (added) {
        applyRow(added.id, added);
      }

      if (firstCheck === null) {
        return;
      }

      // A card that stayed in the list starts the first check by itself (on All a
      // tracked company is in the list too, if it matches the search); otherwise
      // the check starts from here.
      const isShown =
        added !== null &&
        (tab === "tracked" || tab === "all") &&
        matchesCompanySearch(added.name, query);

      if (isShown) {
        setFirstCheckId(firstCheck);
        return;
      }

      void checkCompanyNowAction(firstCheck, tab).then((result) => {
        if (!result.ok && result.reason !== "check-running") {
          showActionFailed();
        }
      });
    },
    [applyRow, tab, query, showActionFailed],
  );

  /**
   * Read as list saved a recipe: the company row is replaced with a fresh one,
   * and if the company left the tab (Needs attention, Not tracked → Tracked),
   * the card disappears. `addRow` does not fit here: it is for a new company not
   * yet in the list, and removes nothing on `null` - the card stayed with the
   * unread-page note until a reload. The first check runs as after Add company.
   */
  const recipeApplied = useCallback(
    (company: CompanyListItem | null, companyId: string) => {
      applyRow(companyId, company);
      addRow(company, companyId);
    },
    [applyRow, addRow],
  );

  const loadMore = useCallback(() => {
    if (!cursor) {
      return;
    }

    startTransition(async () => {
      const result = await loadMoreCompaniesAction(tab, cursor, query);

      if (!result.ok) {
        showActionFailed();
        return;
      }

      setItems((shown) => [...shown, ...result.items]);
      setCursor(result.nextCursor);
    });
  }, [cursor, tab, query, showActionFailed]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {title}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* Check all on Tracked and Needs attention: Not tracked never takes
              part in a general check, and on Needs attention the check shows
              whether a failing source has come back. */}
          {tab !== "not-tracked" ? (
            <CheckAllButton isDisabled={!hasTracked} />
          ) : (
            // On Not tracked, Find new pages takes the place of Check all.
            <FindNewPagesButton isDisabled={!hasNotTracked} />
          )}
          {/* The Add button lives on the Companies page, next to the list. */}
          <AddCompanyDialog
            tab={tab}
            onAdded={addRow}
            onSourceAdded={applyRow}
            platformLabels={platformLabels}
          />
        </div>
      </div>

      <div className="mt-4">{tabs}</div>

      {/* Search only on the All tab. */}
      {tab === "all" ? (
        <div className="mt-4 flex justify-end">
          <CompanySearch query={query} labels={searchLabels} />
        </div>
      ) : null}

      <CompaniesList
        tab={tab}
        items={items}
        hasMore={cursor !== null}
        isLoadingMore={isPending}
        onLoadMore={loadMore}
        onSaved={applyRow}
        onDeleted={removeRow}
        onRecipeApplied={recipeApplied}
        firstCheckId={firstCheckId}
        emptyLabel={emptyLabel}
        heading={listHeading}
        loadMoreLabel={loadMoreLabel}
        noSourcesLabel={noSourcesLabel}
        platformLabels={platformLabels}
        statusLabels={statusLabels}
      />
    </>
  );
}
