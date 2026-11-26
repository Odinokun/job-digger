import { Skeleton } from "@heroui/react";
import { getTranslations } from "next-intl/server";

/** Placeholder rows: roughly the first screen. */
const ROWS = 8;

/**
 * The History page placeholder while the server reads the checks. The heading is
 * real, the rows repeat the table of [`history-board.tsx`](./history-board.tsx):
 * a date and four numbers.
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
