import { Skeleton } from "@heroui/react";
import { getTranslations } from "next-intl/server";

/** How many placeholder rows to show: exactly as many as fit on the first screen. */
const ROWS = 8;

/**
 * The Jobs page placeholder while the server reads vacancies. Next shows it at
 * once on navigation and swaps in the page when it is ready
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md).
 *
 * The heading is real, not a placeholder: it is known in advance, and the page
 * does not jump when the list arrives. The rows repeat the markup of
 * [`vacancy-row.tsx`](./_jobs/vacancy-row.tsx): the title, the company with the
 * location, the date and two buttons.
 */
export default async function JobsLoading() {
  const t = await getTranslations("JobsPage");

  return (
    <div aria-busy="true">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        {t("title")}
      </h1>
      <span className="sr-only" role="status">
        {t("loading")}
      </span>

      <div className="mt-4 flex gap-6 border-b py-2">
        {[16, 12, 20, 8].map((width) => (
          <Skeleton
            key={width}
            className="h-4 rounded"
            style={{ width: `${width * 4}px` }}
          />
        ))}
      </div>

      <ul className="mt-2 divide-y">
        {Array.from({ length: ROWS }, (_, row) => (
          <li
            key={row}
            className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
          >
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-72 max-w-full rounded" />
              <Skeleton className="h-3 w-48 rounded" />
            </div>
            {/* On a phone the date and actions are under the title, on the right -
                like in a real row (vacancy-row.tsx). */}
            <Skeleton className="h-8 w-40 self-end rounded sm:self-auto" />
          </li>
        ))}
      </ul>
    </div>
  );
}
