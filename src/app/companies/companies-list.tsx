"use client";

import { Button } from "@heroui/react";

import type {
  CompaniesTab,
  CompanyListItem,
  CompanySource,
  DiscoveryStatus,
} from "@/lib/companies/company-list";

import { CompanyCard } from "./company-card";

interface CompaniesListProps {
  tab: CompaniesTab;
  items: CompanyListItem[];
  /** Чи є що дозавантажувати: сервер каже це курсором, список лише малює кнопку. */
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onSaved: (companyId: string, saved: CompanyListItem | null) => void;
  onDeleted: (companyId: string) => void;
  emptyLabel: string;
  loadMoreLabel: string;
  noSourcesLabel: string;
  platformLabels: Record<CompanySource["platform"], string>;
  statusLabels: Record<DiscoveryStatus, string>;
}

/**
 * Список компаній із кнопкою Load more.
 *
 * Свого стану не має: показані рядки й курсор тримає
 * [`companies-board.tsx`](./companies-board.tsx), бо міняють їх і Add, і Edit,
 * і Load more. Тут лишилася тільки розмітка.
 */
export function CompaniesList({
  tab,
  items,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onSaved,
  onDeleted,
  emptyLabel,
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
      {/* Дві картки в ряд від ширини sm, одна на вузькому екрані. Саме grid, а
          не flex: у рядку сітки елементи вирівнюються по найвищому, і картка
          компанії з одним джерелом виходить такої самої висоти, що й сусідня з
          чотирма. Саме розтягування - на `h-full` у [картці](./company-card.tsx).
          На flex-wrap висоти були б рваними. */}
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {items.map((company) => (
          <li key={company.id}>
            <CompanyCard
              company={company}
              tab={tab}
              // Статус описує стан пошуку сторінок, тому має сенс лише там,
              // де компанія ще не відстежується (docs/ui.md, розділ 4.3).
              statusLabel={
                tab === "not-tracked"
                  ? statusLabels[company.discoveryStatus]
                  : undefined
              }
              noSourcesLabel={noSourcesLabel}
              platformLabels={platformLabels}
              onSaved={onSaved}
              onDeleted={onDeleted}
            />
          </li>
        ))}
      </ul>

      {/* Кнопки немає, коли курсора немає: сервер уже сказав, що далі нічого. */}
      {hasMore ? (
        <div className="mt-6 flex justify-center">
          {/* Без `variant`: та сама основна кнопка, що Add company. */}
          <Button onPress={onLoadMore} isPending={isLoadingMore}>
            {loadMoreLabel}
          </Button>
        </div>
      ) : null}
    </>
  );
}
