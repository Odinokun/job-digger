"use client";

import { Button, Spinner } from "@heroui/react";
import Link from "next/link";
import { useCallback, useOptimistic, useState, useTransition } from "react";

import { useActionFailedToast } from "@/app/components/use-action-failed-toast";
import type { Cursor } from "@/lib/pagination/cursor";
import {
  adjustTabCounts,
  belongsToJobsTab,
  countNewVacancies,
  patchVacancy,
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
import { VacancyRow } from "./vacancy-row";

interface JobsBoardProps {
  tab: JobsTab;
  title: string;
  tabsLabel: string;
  tabLabels: Record<JobsTab, string>;
  /**
   * Скільки рядків у кожній вкладці - як знає сервер. Свіжі приходять із
   * перечитаною сторінкою після кожної дії (`revalidateHeaderCounts`).
   */
  counts: JobsTabCounts;
  /**
   * Перша порція: її рендерить сервер, тож список видно без JavaScript. Коли
   * сторінку перечитано (`router.refresh` опитування чи дія), тут свіжа
   * порція, а показаний список лишається в стані - див. `useNewVacanciesNotice`.
   */
  initialItems: VacancyListItem[];
  initialCursor: Cursor | null;
  emptyLabel: string;
  /** Кнопка в Companies - лише коли вакансій немає зовсім, а не у вкладці. */
  addCompanyLabel: string | null;
  loadMoreLabel: string;
}

/**
 * Сторінка Jobs як одне ціле: заголовок, вкладки й список із Load more.
 *
 * Показані рядки й курсор живуть тут, як у
 * [`companies-board.tsx`](../companies/companies-board.tsx). Стан не перетікає
 * між вкладками: `key` на цьому компоненті - сама вкладка.
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
}: JobsBoardProps) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [isPending, startTransition] = useTransition();
  // Окремий перехід для Read і Favorite: інакше кнопка Load more крутилася б,
  // поки йде дія над рядком.
  const [, startMark] = useTransition();
  const showActionFailed = useActionFailedToast();

  /**
   * Оптимістичний список: дія Read чи Favorite видна одразу, ще до відповіді
   * сервера (docs/ui.md, розділ 4, «Очікування»). Поки дія триває, React
   * показує `items` з накладеною зміною; коли вона завершується - знову сам
   * `items`. Тож при збої рядок повертається сам, бо `items` оновлюється лише
   * при успіху (https://react.dev/reference/react/useOptimistic).
   */
  const [shown, addPatch] = useOptimistic(items, patchVacancy);

  /**
   * Рядок після дії заміщає свій попередній на тому самому місці - дата
   * виявлення, за якою відсортовано список, від дій не змінюється. Якщо
   * вакансія більше не належить вкладці (прочитана в Unread, прибрана з
   * Favorites) або її вже немає - рядок прибирається.
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

  /** Read або Favorite для рядка: одразу в інтерфейсі, потім на сервері. */
  const mark = useCallback(
    (patch: VacancyPatch) => {
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

        applyRow(patch.id, result.vacancy);
      });
    },
    [addPatch, applyRow, showActionFailed],
  );

  // Рядок, який дія вивела з вкладки, зникає одразу, ще до відповіді сервера.
  const visible = shown.filter((vacancy) => belongsToJobsTab(vacancy, tab));
  // Числа вкладок рухаються разом із рядком, а не після відповіді сервера.
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
   * Після Mark all as read непрочитаних, що були в списку, більше немає: усі
   * показані рядки записані до межі дії. Знайдені пізніше зʼявляться при
   * наступному відкритті вкладки.
   */
  const clearList = useCallback(() => {
    setItems([]);
    setCursor(null);
  }, []);

  /**
   * Нові вакансії не вливаються в список самі (задача 4.13): `router.refresh`
   * приносить свіжу першу порцію в пропси, а стан зі списком лишається. Show
   * перечитує вкладку з першої порції - бере саме цю свіжу порцію.
   */
  const newCount = countNewVacancies(items, initialItems);
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
            // Посилання, а не кнопка з модалкою: Add company живе на сторінці
            // Companies, поруч зі списком компаній (docs/ui.md, розділ 4.2).
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
          <ul className="mt-2 divide-y">
            {visible.map((vacancy) => (
              <li key={vacancy.id}>
                <VacancyRow vacancy={vacancy} onMark={mark} />
              </li>
            ))}
          </ul>

          {cursor === null ? null : (
            <div className="mt-6 flex justify-center">
              <Button
                variant="secondary"
                isPending={isPending}
                onPress={loadMore}
              >
                {/* `isPending` у HeroUI лише вимикає кнопку - спінер малюємо
                    самі, як у прикладі Loading документації Button. */}
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
