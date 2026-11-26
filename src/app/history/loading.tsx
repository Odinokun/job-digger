import { Skeleton } from "@heroui/react";
import { getTranslations } from "next-intl/server";

/** Рядків-заготовок: приблизно перший екран. */
const ROWS = 8;

/**
 * Заготовка сторінки History, поки сервер читає перевірки. Заголовок справжній, рядки повторюють таблицю
 * [`history-board.tsx`](./history-board.tsx): дата й чотири числа.
 */
export default async function HistoryLoading() {
  const t = await getTranslations("HistoryPage");

  return (
    <div aria-busy="true">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        {t("title")}
      </h1>
      <span className="sr-only" role="status">
        {t("loading")}
      </span>

      <div className="mt-6 flex flex-col divide-y">
        {Array.from({ length: ROWS }, (_, row) => (
          <div key={row} className="flex justify-between gap-4 py-3">
            <Skeleton className="h-4 w-40 rounded" />
            <Skeleton className="h-4 w-56 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
