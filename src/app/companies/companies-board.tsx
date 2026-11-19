"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";

import { useCheckStatus } from "@/app/components/check-status-provider";
import { useActionFailedToast } from "@/app/components/use-action-failed-toast";
import {
  compareCompanyRows,
  type CompaniesTab,
  type CompanyListItem,
  type CompanySource,
  type DiscoveryStatus,
} from "@/lib/companies/company-list";
import type { Cursor } from "@/lib/pagination/cursor";

import { loadMoreCompaniesAction, reloadCompaniesAction } from "./actions";
import { AddCompanyDialog } from "./add-company-dialog";
import { CheckAllButton } from "./check-all-button";
import { CompaniesList } from "./companies-list";

interface CompaniesBoardProps {
  tab: CompaniesTab;
  title: string;
  /** Вкладки з лічильниками - серверний компонент, тому приходять готовими. */
  tabs: ReactNode;
  /** Перша порція: її рендерить сервер, тому список видно без JavaScript. */
  initialItems: CompanyListItem[];
  initialCursor: Cursor | null;
  emptyLabel: string;
  loadMoreLabel: string;
  noSourcesLabel: string;
  platformLabels: Record<CompanySource["platform"], string>;
  statusLabels: Record<DiscoveryStatus, string>;
  /** Чи є на Tracked хоч одна компанія - інакше Check all вимкнена. */
  hasTracked: boolean;
}

/**
 * Сторінка Companies як одне ціле: кнопка Add, вкладки і список.
 *
 * Показані рядки живуть тут, а не в самому списку, бо міняють їх і Add, і
 * Edit, і Load more - усі три поруч. Якби стан лежав у списку, кнопка Add зі
 * сторінки не мала б як до нього дотягнутися, і додана компанія зʼявлялася б
 * аж після перезавантаження.
 *
 * Перечитування сторінки список не чіпає: він зібраний із власного стану. Тому
 * кожна дія повертає рядок, якого торкнулася, а `revalidatePath` лишається
 * заради лічильників вкладок - вони рендеряться на сервері.
 *
 * Стан не перетікає між вкладками: `key` на цьому компоненті - сама вкладка.
 */
export function CompaniesBoard({
  tab,
  title,
  tabs,
  initialItems,
  initialCursor,
  emptyLabel,
  loadMoreLabel,
  noSourcesLabel,
  platformLabels,
  statusLabels,
  hasTracked,
}: CompaniesBoardProps) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [isPending, startTransition] = useTransition();
  const showActionFailed = useActionFailedToast();
  const { status } = useCheckStatus();
  const isCheckRunning = (status?.run ?? null) !== null;
  const wasCheckRunning = useRef(false);
  const shownCount = items.length;

  // Загальна перевірка закінчилась - статуси й «Last checked» змінились, а
  // рядки живуть у стані й самі не оновлюються. Перечитуємо стільки, скільки
  // показано, щоб не загубити дозавантажені порції.
  useEffect(() => {
    if (wasCheckRunning.current && !isCheckRunning) {
      void reloadCompaniesAction(tab, shownCount).then((result) => {
        if (!result.ok) return;
        setItems(result.items);
        setCursor(result.nextCursor);
      });
    }
    wasCheckRunning.current = isCheckRunning;
  }, [isCheckRunning, tab, shownCount]);

  /**
   * Рядок, якого торкнулася дія, заміщає свій попередній.
   *
   * Саме рядок, а не весь список: перечитування скинуло б дозавантажені
   * порції, і користувач, який дійшов до двохсотої компанії, повернувся б до
   * перших пʼятдесяти. `null` означає, що компанія цій вкладці не належить -
   * рядок прибираємо (або не додаємо).
   *
   * Назва задає місце в алфавіті, тому показане пересортовується тим самим
   * порядком, що й запит. Компанія, чия назва стоїть далі за всі завантажені,
   * лишається в кінці списку - до наступного читання з сервера, яке поставить
   * її на місце.
   */
  const applyRow = useCallback(
    (companyId: string, row: CompanyListItem | null) => {
      setItems((shown) => {
        const without = shown.filter((company) => company.id !== companyId);

        return row ? [...without, row].sort(compareCompanyRows) : without;
      });
    },
    [],
  );

  /**
   * Видалену компанію прибираємо зі списку: той самий `applyRow` без рядка.
   * Окремий колбек, а не `applyRow` напряму, бо діалог видалення не має чого
   * повертати - рядка більше немає.
   */
  const removeRow = useCallback(
    (companyId: string) => {
      applyRow(companyId, null);
    },
    [applyRow],
  );

  const addRow = useCallback(
    (added: CompanyListItem | null) => {
      if (added) {
        applyRow(added.id, added);
      }
    },
    [applyRow],
  );

  const loadMore = useCallback(() => {
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
  }, [cursor, tab, showActionFailed]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {title}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* Check all - лише на Tracked: Not tracked у загальній перевірці
              не бере участі ніколи (docs/ui.md, розділ 4.3). */}
          {tab === "tracked" ? (
            <CheckAllButton isDisabled={!hasTracked} />
          ) : null}
          {/* Кнопка Add живе на сторінці Companies, поруч зі списком
              (docs/ui.md, розділ 4.2). */}
          <AddCompanyDialog
            tab={tab}
            onAdded={addRow}
            onSourceAdded={applyRow}
            platformLabels={platformLabels}
          />
        </div>
      </div>

      <div className="mt-4">{tabs}</div>

      <CompaniesList
        tab={tab}
        items={items}
        hasMore={cursor !== null}
        isLoadingMore={isPending}
        onLoadMore={loadMore}
        onSaved={applyRow}
        onDeleted={removeRow}
        emptyLabel={emptyLabel}
        loadMoreLabel={loadMoreLabel}
        noSourcesLabel={noSourcesLabel}
        platformLabels={platformLabels}
        statusLabels={statusLabels}
      />
    </>
  );
}
