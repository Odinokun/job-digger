"use client";

import { Button } from "@heroui/react";
import Link from "next/link";
import { useCallback, useState, useTransition, type ReactNode } from "react";

import { useActionFailedToast } from "@/app/components/use-action-failed-toast";
import type { Cursor } from "@/lib/pagination/cursor";
import type { JobsTab, VacancyListItem } from "@/lib/vacancies/vacancy-list";

import { loadMoreVacanciesAction } from "./actions";
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
  const showActionFailed = useActionFailedToast();

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

      {items.length === 0 ? (
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
            {items.map((vacancy) => (
              <li key={vacancy.id}>
                <VacancyRow vacancy={vacancy} />
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
                {loadMoreLabel}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
