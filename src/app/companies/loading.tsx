import { Skeleton } from "@heroui/react";
import { getTranslations } from "next-intl/server";

/** Чотири картки - два ряди сітки, перший екран. */
const CARDS = 4;

/**
 * Заготовка сторінки Companies, поки сервер читає компанії (docs/ui.md,
 * розділ 4, «Очікування»). Заголовок справжній, картки повторюють обриси
 * [`company-card.tsx`](./company-card.tsx): назва, джерело, підвал із кнопками.
 */
export default async function CompaniesLoading() {
  const t = await getTranslations("CompaniesPage");

  return (
    <div aria-busy="true">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        {t("title")}
      </h1>
      <span className="sr-only" role="status">
        {t("loading")}
      </span>

      <div className="mt-4 flex gap-6 border-b py-2">
        <Skeleton className="h-4 w-24 rounded" />
        <Skeleton className="h-4 w-28 rounded" />
      </div>

      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {Array.from({ length: CARDS }, (_, card) => (
          <li key={card} className="flex flex-col gap-4 rounded-2xl border p-4">
            <Skeleton className="h-5 w-40 rounded" />
            <Skeleton className="h-4 w-64 rounded" />
            <div className="flex justify-between">
              <Skeleton className="h-4 w-32 rounded" />
              <Skeleton className="h-8 w-36 rounded" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
