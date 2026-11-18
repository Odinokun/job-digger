"use client";

import { Button, Spinner } from "@heroui/react";
import Link from "next/link";
import {
  useCallback,
  useOptimistic,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import { useActionFailedToast } from "@/app/components/use-action-failed-toast";
import type { Cursor } from "@/lib/pagination/cursor";
import {
  belongsToJobsTab,
  patchVacancy,
  type JobsTab,
  type VacancyListItem,
  type VacancyPatch,
} from "@/lib/vacancies/vacancy-list";

import {
  loadMoreVacanciesAction,
  setVacancyFavoriteAction,
  setVacancyReadAction,
} from "./actions";
import { VacancyRow } from "./vacancy-row";

interface JobsBoardProps {
  tab: JobsTab;
  title: string;
  /** Вкладки - серверний компонент, тому приходять готовими. */
  tabs: ReactNode;
  /** Перша порція: її рендерить сервер, тож список видно без JavaScript. */
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
  tabs,
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

  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        {title}
      </h1>

      <div className="mt-4">{tabs}</div>

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
