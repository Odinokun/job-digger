import { Skeleton } from "@heroui/react";
import { getTranslations } from "next-intl/server";

/** Four cards - two grid rows, the first screen. */
const CARDS = 4;

/**
 * The Companies page placeholder while the server reads the companies. The
 * heading is real, the cards repeat the outline of
 * [`company-card.tsx`](./company-card.tsx): the name, a source, the footer with buttons.
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

      <ul className="mt-6 grid gap-4">
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
