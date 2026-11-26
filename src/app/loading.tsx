import { Skeleton } from "@heroui/react";
import { getTranslations } from "next-intl/server";

/** Скільки заготовок рядків показувати: рівно стільки вміщує перший екран. */
const ROWS = 8;

/**
 * Заготовка сторінки Jobs, поки сервер читає вакансії. Next показує її одразу при переході й підміняє сторінкою,
 * коли та готова (node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/loading.md).
 *
 * Заголовок справжній, а не заготовка: він відомий наперед, і сторінка не
 * стрибає, коли приходить список. Рядки повторюють розмітку
 * [`vacancy-row.tsx`](./_jobs/vacancy-row.tsx): назва, компанія з локацією,
 * дата й дві кнопки.
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
          <li key={row} className="flex items-start justify-between gap-6 py-3">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-72 rounded" />
              <Skeleton className="h-3 w-48 rounded" />
            </div>
            <Skeleton className="h-8 w-40 rounded" />
          </li>
        ))}
      </ul>
    </div>
  );
}
