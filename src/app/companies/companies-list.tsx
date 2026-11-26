"use client";

import { Button, Spinner } from "@heroui/react";

import {
  isTrackedCompany,
  type CompaniesTab,
  type CompanyListItem,
  type CompanySource,
  type DiscoveryStatus,
} from "@/lib/companies/company-list";

import { CompanyCard } from "./company-card";

interface CompaniesListProps {
  tab: CompaniesTab;
  items: CompanyListItem[];
  /** Whether there is more to load: the server says so with a cursor, the list only draws the button. */
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onSaved: (companyId: string, saved: CompanyListItem | null) => void;
  onDeleted: (companyId: string) => void;
  /** An own page got a recipe (task 6.21) - like a new company. */
  onRecipeApplied: (company: CompanyListItem | null, companyId: string) => void;
  /** A new company whose card starts the first check by itself. */
  firstCheckId: string | null;
  emptyLabel: string;
  /** A heading above the list hidden from sight - the tab name. */
  heading: string;
  loadMoreLabel: string;
  noSourcesLabel: string;
  platformLabels: Record<CompanySource["platform"], string>;
  statusLabels: Record<DiscoveryStatus, string>;
}

/**
 * The company list with a Load more button.
 *
 * It has no state of its own: [`companies-board.tsx`](./companies-board.tsx)
 * holds the shown rows and the cursor, because Add, Edit and Load more all
 * change them. Only the markup is left here.
 */
export function CompaniesList({
  tab,
  items,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onSaved,
  onDeleted,
  onRecipeApplied,
  firstCheckId,
  emptyLabel,
  heading,
  loadMoreLabel,
  noSourcesLabel,
  platformLabels,
  statusLabels,
}: CompaniesListProps) {
  if (items.length === 0) {
    return <p className="mt-6 text-sm text-muted">{emptyLabel}</p>;
  }

  return (
    <>
      {/* Card titles are `h3`: HeroUI `Card.Title` renders no other tag.
          Without an `h2` between them and the page `h1`, headings would skip a
          level (axe and Lighthouse `heading-order`), and the list would have no
          name in the VoiceOver rotor. So the `h2` is there, but only for screen
          readers. */}
      <h2 className="sr-only">{heading}</h2>
      {/* One column at any width (UI audit, B2): the company list reads top to
          bottom, like Jobs, while cards side by side stretched to the tallest
          one or left gaps. `min-w-0` makes a long address truncate with "…"
          instead of pushing the column wider than the screen. */}
      <ul className="mt-6 grid gap-4">
        {items.map((company) => (
          <li key={company.id} className="min-w-0">
            <CompanyCard
              company={company}
              tab={tab}
              startsCheck={company.id === firstCheckId}
              // The status describes the state of the page search, so it only
              // makes sense where the company is not tracked yet. The company,
              // not the tab: Needs attention mixes both.
              statusLabel={
                isTrackedCompany(company.sources)
                  ? undefined
                  : statusLabels[company.discoveryStatus]
              }
              noSourcesLabel={noSourcesLabel}
              platformLabels={platformLabels}
              onSaved={onSaved}
              onDeleted={onDeleted}
              onRecipeApplied={onRecipeApplied}
            />
          </li>
        ))}
      </ul>

      {/* No button without a cursor: the server has already said there is nothing more. */}
      {hasMore ? (
        <div className="mt-6 flex justify-center">
          {/* No `variant`: the same primary button as Add company. */}
          <Button onPress={onLoadMore} isPending={isLoadingMore}>
            {/* HeroUI `isPending` only disables the button - we draw the spinner
                ourselves (Button docs, the Loading example). */}
            {({ isPending }) => (
              <>
                {isPending ? <Spinner color="current" size="sm" /> : null}
                {loadMoreLabel}
              </>
            )}
          </Button>
        </div>
      ) : null}
    </>
  );
}
