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
 * виявлення й дії Read і Favorite. Непрочитана
 * вакансія виділена жирнішою назвою і крапкою кольору уваги перед назвою -
 * на вкладках All і Favorites це те, що відрізняє її від прочитаної.
 *
 * Назва, компанія й локація прийшли з чужих сайтів, тому рендеряться лише як
 * текст - JSX екранує їх сам. Посилання відкривається в новій вкладці з
 * `rel="noopener noreferrer"` (CLAUDE.md, «Безпека»).
 */
interface VacancyRowProps {
  vacancy: VacancyListItem;
  onMark: (patch: VacancyPatch) => void;
}

export function VacancyRow({ vacancy, onMark }: VacancyRowProps) {
  const t = useTranslations("JobsPage");
  const format = useFormatter();

  // Від `sm` (640px) дата й дії завжди праворуч: довга назва переноситься
  // всередині лівого блоку (`min-w-0`), а не виштовхує їх на новий рядок.
  // Вужче - місця на два стовпці немає, і вони стають під назву. Вирівнювання
  // по верху: при назві у два рядки дії стоять навпроти її початку.
  //
  // Рядок під мишею трохи світлішає - фон картки `bg-surface` із плавним
  // переходом (задача 6.19). Щоб текст лишився на одній лінії із заголовком
  // сторінки, фон виходить у поле сторінки: `-mx-4 px-4`. Поле не менше 16px,
  // а `hover:` у Tailwind v4 спрацьовує лише там, де є миша.
  return (
    <div className="-mx-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-1 rounded-lg px-4 py-3 transition-colors hover:bg-surface sm:flex-nowrap">
      {/* Крапка «нова» - у власній вузькій колонці перед назвою, всередині
          колонки тексту, а не в полі сторінки (аудит інтерфейсу, B3): там вона
          на телефоні майже торкалась краю екрана. У прочитаної колонка
          порожня, тож назви всіх рядків вирівняні. Центр - на середині першого
          рядка назви (висота рядка 24px). */}
      <div className="flex min-w-0 gap-2">
        <span aria-hidden className="flex h-6 w-2 shrink-0 items-center">
          {vacancy.isRead ? null : (
            <span className="size-2 rounded-full bg-attention" />
          )}
        </span>
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
          {/* «Компанія · місто»: компанія основним кольором, місто
            приглушеним, між ними розділювач (аудит, B3) - раніше обидва були
            одного кольору й читались як одна фраза. */}
          <div className="flex flex-wrap gap-x-2 text-hint text-muted">
            <span className="font-medium text-foreground">
              {vacancy.companyName}
            </span>
            <span aria-hidden>·</span>
            {/* Тире не перекладається: це не слово, а знак «немає даних». */}
            <span>{vacancy.location ?? "—"}</span>
          </div>
        </div>
      </div>
      {/* Абсолютна дата за локаллю: відносний формат лишається для «Last
          checked». Часовий пояс - той, що next-intl
          передає з сервера, тож серверний і клієнтський текст збігаються. */}
      <div className="flex shrink-0 items-center gap-4">
        <time
          dateTime={vacancy.firstDetectedAt.toISOString()}
          className="text-hint text-muted tabular-nums"
        >
          {format.dateTime(vacancy.firstDetectedAt, { dateStyle: "medium" })}
        </time>
        <VacancyActions vacancy={vacancy} onMark={onMark} />
      </div>
    </div>
  );
}
