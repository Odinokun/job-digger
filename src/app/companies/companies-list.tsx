"use client";

import { Button } from "@heroui/react";
import { useState, useTransition } from "react";

import { useActionFailedToast } from "@/app/components/use-action-failed-toast";
import type {
  CompaniesTab,
  CompanyListItem,
  CompanySource,
  DiscoveryStatus,
} from "@/lib/companies/company-list";
import type { Cursor } from "@/lib/pagination/cursor";

import { loadMoreCompaniesAction } from "./actions";
import { CompanyCard } from "./company-card";

interface CompaniesListProps {
  tab: CompaniesTab;
  /** Перша порція: її рендерить сервер, тому список видно без JavaScript. */
  initialItems: CompanyListItem[];
  initialCursor: Cursor | null;
  emptyLabel: string;
  loadMoreLabel: string;
  noSourcesLabel: string;
  platformLabels: Record<CompanySource["platform"], string>;
  statusLabels: Record<DiscoveryStatus, string>;
}

/**
 * Список компаній із кнопкою Load more.
 *
 * Клієнтський, бо Load more **додає** наступні 50 до вже показаних
 * (docs/ui.md, розділ 4.2), і накопичені порції мусять десь жити. Ціна -
 * дозавантажене зникає при перезавантаженні сторінки: в адресі лишається
 * тільки вкладка.
 *
 * Порції тримає `useState`, а не `useActionState`: той передає попередній стан
 * у Server Action, тобто ганяв би всі вже показані компанії на сервер і назад
 * на кожне натискання.
 */
export function CompaniesList({
  tab,
  initialItems,
  initialCursor,
  emptyLabel,
  loadMoreLabel,
  noSourcesLabel,
  platformLabels,
  statusLabels,
}: CompaniesListProps) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [isPending, startTransition] = useTransition();
  const showActionFailed = useActionFailedToast();

  function loadMore() {
    if (!cursor) {
      return;
    }

    startTransition(async () => {
      const result = await loadMoreCompaniesAction(tab, cursor);

      if (!result.ok) {
        showActionFailed();
        return;
      }

      setItems((shown) => [...shown, ...result.items]);
      setCursor(result.nextCursor);
    });
  }

  if (items.length === 0) {
    return <p className="mt-6 text-sm text-muted">{emptyLabel}</p>;
  }

  return (
    <>
      <ul className="mt-6 flex flex-col gap-4">
        {items.map((company) => (
          <li key={company.id}>
            <CompanyCard
              company={company}
              // Статус описує стан пошуку сторінок, тому має сенс лише там,
              // де компанія ще не відстежується (docs/ui.md, розділ 4.3).
              statusLabel={
                tab === "not-tracked"
                  ? statusLabels[company.discoveryStatus]
                  : undefined
              }
              noSourcesLabel={noSourcesLabel}
              platformLabels={platformLabels}
            />
          </li>
        ))}
      </ul>

      {/* Кнопки немає, коли курсора немає: сервер уже сказав, що далі нічого. */}
      {cursor ? (
        <div className="mt-6 flex justify-center">
          {/* Без `variant`: та сама основна кнопка, що Add company. */}
          <Button onPress={loadMore} isPending={isPending}>
            {loadMoreLabel}
          </Button>
        </div>
      ) : null}
    </>
  );
}
