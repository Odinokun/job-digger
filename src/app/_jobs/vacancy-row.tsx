"use client";

import { Chip } from "@heroui/react";
import { useFormatter, useTranslations } from "next-intl";

import type { VacancyListItem } from "@/lib/vacancies/vacancy-list";

/**
 * Один рядок списку Jobs: назва-посилання на оригінал, компанія, локація й дата
 * виявлення (docs/ui.md, розділ 4.1). Дії над вакансією - задача 3.16.
 *
 * Назва, компанія й локація прийшли з чужих сайтів, тому рендеряться лише як
 * текст - JSX екранує їх сам. Посилання відкривається в новій вкладці з
 * `rel="noopener noreferrer"` (docs/security.md).
 */
export function VacancyRow({ vacancy }: { vacancy: VacancyListItem }) {
  const t = useTranslations("JobsPage");
  const format = useFormatter();

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={vacancy.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline-offset-2 hover:underline"
          >
            {vacancy.title}
          </a>
          {vacancy.closedAt === null ? null : (
            <Chip size="sm" color="warning" variant="primary">
              {t("closed")}
            </Chip>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 text-sm text-muted">
          <span>{vacancy.companyName}</span>
          {/* Тире не перекладається: це не слово, а знак «немає даних». */}
          <span>{vacancy.location ?? "—"}</span>
        </div>
      </div>
      {/* Абсолютна дата за локаллю: відносний формат лишається для «Last
          checked» (docs/ui.md, розділ 4.1). Часовий пояс - той, що next-intl
          передає з сервера, тож серверний і клієнтський текст збігаються. */}
      <time
        dateTime={vacancy.firstDetectedAt.toISOString()}
        className="text-sm text-muted tabular-nums"
      >
        {format.dateTime(vacancy.firstDetectedAt, { dateStyle: "medium" })}
      </time>
    </div>
  );
}
