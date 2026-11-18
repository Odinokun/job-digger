"use client";

import { Chip } from "@heroui/react";
import { useFormatter, useTranslations } from "next-intl";

import type {
  VacancyListItem,
  VacancyPatch,
} from "@/lib/vacancies/vacancy-list";

import { VacancyActions } from "./vacancy-actions";

/**
 * Один рядок списку Jobs: назва-посилання на оригінал, компанія, локація й дата
 * виявлення й дії Read і Favorite (docs/ui.md, розділ 4.1). Непрочитана
 * вакансія виділена жирнішою назвою - на вкладках All і Favorites це єдине, що
 * відрізняє її від прочитаної.
 *
 * Назва, компанія й локація прийшли з чужих сайтів, тому рендеряться лише як
 * текст - JSX екранує їх сам. Посилання відкривається в новій вкладці з
 * `rel="noopener noreferrer"` (docs/security.md).
 */
interface VacancyRowProps {
  vacancy: VacancyListItem;
  onMark: (patch: VacancyPatch) => void;
}

export function VacancyRow({ vacancy, onMark }: VacancyRowProps) {
  const t = useTranslations("JobsPage");
  const format = useFormatter();

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={vacancy.url}
            target="_blank"
            rel="noopener noreferrer"
            className={
              vacancy.isRead
                ? "underline-offset-2 hover:underline"
                : "font-semibold underline-offset-2 hover:underline"
            }
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
      <div className="flex items-center gap-4">
        <time
          dateTime={vacancy.firstDetectedAt.toISOString()}
          className="text-sm text-muted tabular-nums"
        >
          {format.dateTime(vacancy.firstDetectedAt, { dateStyle: "medium" })}
        </time>
        <VacancyActions vacancy={vacancy} onMark={onMark} />
      </div>
    </div>
  );
}
