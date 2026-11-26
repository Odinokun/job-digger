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
  /** Вкладки з лічильниками - серверний компонент, тому приходять готовими. */
  tabs: ReactNode;
  /** Перша порція: її рендерить сервер, тому список видно без JavaScript. */
  initialItems: CompanyListItem[];
  initialCursor: Cursor | null;
  emptyLabel: string;
  /** Назва вкладки - прихований заголовок списку, див. `companies-list.tsx`. */
  listHeading: string;
  loadMoreLabel: string;
  noSourcesLabel: string;
  platformLabels: Record<CompanySource["platform"], string>;
  statusLabels: Record<DiscoveryStatus, string>;
  /** Чи є на Tracked хоч одна компанія - інакше Check all вимкнена. */
  hasTracked: boolean;
  /** Чи є на Not tracked хоч одна компанія - інакше Find new pages вимкнена. */
  hasNotTracked: boolean;
  /** Пошук за назвою на вкладці All; на інших вкладках - порожній рядок. */
  query: string;
  searchLabels: {
    open: string;
    field: string;
    placeholder: string;
    close: string;
  };
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

  // Новий пошук - новий список із першої порції. Не через `key`, як вкладка:
  // перемонтування забрало б фокус із поля пошуку посеред друкування.
  // Стан скидається під час рендера, коли змінився пропс
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const [shownQuery, setShownQuery] = useState(query);
  if (query !== shownQuery) {
    setShownQuery(query);
    setItems(initialItems);
    setCursor(initialCursor);
  }
  const [isPending, startTransition] = useTransition();
  // Нова компанія, чия картка має сама почати першу перевірку (задача 5.09).
  const [firstCheckId, setFirstCheckId] = useState<string | null>(null);
  const showActionFailed = useActionFailedToast();
  const { status } = useCheckStatus();
  const isCheckRunning = status !== null && isBusy(status);
  const wasCheckRunning = useRef(false);
  const shownCount = items.length;

  // Загальна перевірка чи Find new pages закінчились - статуси, «Last
  // checked» і сам склад вкладок змінились, а рядки живуть у стані й самі не
  // оновлюються. Перечитуємо стільки, скільки показано, щоб не загубити
  // дозавантажені порції.
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
   * її на місце. Під час пошуку рядок, назва якого під пошук не підходить
   * (додана компанія чи перейменована в Edit), теж прибирається - як його не
   * показав би й сервер.
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

  /**
   * Нова компанія: рядок у список і перша перевірка, якщо є що перевіряти
   * (src/app/README.md, «Додавання компанії»).
   *
   * Видна картка перевіряє себе сама - кнопкою Check now, зі спінером, як після
   * натискання. Не видна (компанію додали з вкладки Not tracked) - перевірка
   * йде без кнопки; лічильник Jobs оновить відповідь дії.
   */
  const addRow = useCallback(
    (added: CompanyListItem | null, firstCheck: string | null) => {
      if (added) {
        applyRow(added.id, added);
      }

      if (firstCheck === null) {
        return;
      }

      // Картка, що лишилась у списку, сама стартує першу перевірку (на All
      // відстежувана компанія теж у списку, якщо підходить під пошук), інакше
      // перевірку запускаємо звідси.
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
   * Read as list записав рецепт: рядок компанії замінюється свіжим, а якщо
   * компанія з вкладки пішла (Needs attention, Not tracked → Tracked), картка
   * зникає. `addRow` тут не годиться: він для нової компанії, якої ще немає в
   * списку, і на `null` нічого не прибирає - картка лишалася з написом про
   * непрочитану сторінку до перезавантаження. Перша перевірка - як після Add
   * company.
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
          {/* Check all - на Tracked і Needs attention: Not tracked у
              загальній перевірці не бере участі ніколи, а на Needs attention перевірка й покаже, чи
              джерело, що падало, ожило. */}
          {tab !== "not-tracked" ? (
            <CheckAllButton isDisabled={!hasTracked} />
          ) : (
            // На Not tracked замість Check all - Find new pages (розділ 4.3).
            <FindNewPagesButton isDisabled={!hasNotTracked} />
          )}
          {/* Кнопка Add живе на сторінці Companies, поруч зі списком. */}
          <AddCompanyDialog
            tab={tab}
            onAdded={addRow}
            onSourceAdded={applyRow}
            platformLabels={platformLabels}
          />
        </div>
      </div>

      <div className="mt-4">{tabs}</div>

      {/* Пошук - лише на вкладці All (рішення автора 24.11.2026). */}
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
