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
  /** Чи є що дозавантажувати: сервер каже це курсором, список лише малює кнопку. */
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onSaved: (companyId: string, saved: CompanyListItem | null) => void;
  onDeleted: (companyId: string) => void;
  /** Власній сторінці дали рецепт (задача 6.21) - як нова компанія. */
  onRecipeApplied: (company: CompanyListItem | null, companyId: string) => void;
  /** Нова компанія, картка якої сама починає першу перевірку. */
  firstCheckId: string | null;
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
  onRecipeApplied,
  firstCheckId,
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
              startsCheck={company.id === firstCheckId}
              // Статус описує стан пошуку сторінок, тому має сенс лише там,
              // де компанія ще не відстежується (docs/ui.md, розділ 4.3). Саме
              // компанія, а не вкладка: на Needs attention змішані обидві.
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

      {/* Кнопки немає, коли курсора немає: сервер уже сказав, що далі нічого. */}
      {hasMore ? (
        <div className="mt-6 flex justify-center">
          {/* Без `variant`: та сама основна кнопка, що Add company. */}
          <Button onPress={onLoadMore} isPending={isLoadingMore}>
            {/* `isPending` у HeroUI лише вимикає кнопку - спінер малюємо самі
                (документація Button, приклад Loading). */}
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
