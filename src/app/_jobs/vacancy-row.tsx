"use client";

import { Chip } from "@heroui/react";
import { useFormatter, useTranslations } from "next-intl";

import type {
  VacancyListItem,
  VacancyPatch,
} from "@/lib/vacancies/vacancy-list";

import { VacancyActions } from "./vacancy-actions";

/**
 * One row of the Jobs list: the title as a link to the original, the company,
 * the location, the discovery date and the Read and Favorite actions. An unread
 * vacancy has a bolder title and a dot in the attention colour before it - on
 * the All and Favorites tabs that is what sets it apart from a read one.
 *
 * The title, company and location come from other sites, so they render only as
 * text - JSX escapes them itself. The link opens in a new tab with
 * `rel="noopener noreferrer"` (CLAUDE.md, "Security").
 */
interface VacancyRowProps {
  vacancy: VacancyListItem;
  onMark: (patch: VacancyPatch) => void;
}

export function VacancyRow({ vacancy, onMark }: VacancyRowProps) {
  const t = useTranslations("JobsPage");
  const format = useFormatter();

  // From `sm` (640px) the date and the actions are always on the right: a long
  // title wraps inside the left block (`min-w-0`) instead of pushing them to a
  // new line. Narrower, there is no room for two columns, and they go under the
  // title. Aligned to the top: with a two-line title the actions face its start.
  //
  // The row under the mouse lightens a little - the `bg-surface` card background
  // with a smooth transition (task 6.19). To keep the text in line with the page
  // heading, the background extends into the page margin: `-mx-4 px-4`. The
  // margin is at least 16px, and `hover:` in Tailwind v4 applies only where there
  // is a mouse.
  return (
    <div className="-mx-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-1 rounded-lg px-4 py-3 transition-colors hover:bg-surface sm:flex-nowrap">
      {/* The "new" dot sits in its own narrow column before the title, inside
          the text column, not in the page margin (UI audit, B3): there it almost
          touched the edge of a phone screen. For a read vacancy the column is
          empty, so all titles line up. Its centre is at the middle of the
          title's first line (line height 24px). */}
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
          {/* "Company · city": the company in the main colour, the city muted,
            a separator between them (audit, B3) - before, both had the same
            colour and read as one phrase. */}
          <div className="flex flex-wrap gap-x-2 text-hint text-muted">
            <span className="font-medium text-foreground">
              {vacancy.companyName}
            </span>
            <span aria-hidden>·</span>
            {/* The dash is not translated: it is not a word but a "no data" sign. */}
            <span>{vacancy.location ?? "—"}</span>
          </div>
        </div>
      </div>
      {/* An absolute date in the user's locale: the relative format stays for
          "Last checked". The time zone is the one next-intl passes from the
          server, so server and client text match. */}
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
