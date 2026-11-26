"use client";

import { Button, Spinner } from "@heroui/react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { useActionFailedToast } from "@/app/components/use-action-failed-toast";
import type { CheckRunRow } from "@/lib/checks/check-status";
import type { Cursor } from "@/lib/pagination/cursor";

import { loadMoreHistoryAction } from "./actions";

interface HistoryBoardProps {
  /** The first batch: the server renders it, so the table is visible without JavaScript. */
  initialItems: CheckRunRow[];
  initialCursor: Cursor | null;
}

/**
 * The History table with Load more. A plain `<table>`, not HeroUI's Table: that
 * one is a React Aria grid with selection and keyboard navigation between cells,
 * while here five numbers are only read.
 */
export function HistoryBoard({
  initialItems,
  initialCursor,
}: HistoryBoardProps) {
  const t = useTranslations("HistoryPage");
  const format = useFormatter();
  const showActionFailed = useActionFailedToast();
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [isPending, startTransition] = useTransition();

  const loadMore = () =>
    startTransition(async () => {
      const result = await loadMoreHistoryAction(cursor);
      if (!result.ok) {
        showActionFailed();
        return;
      }
      setItems((shown) => [...shown, ...result.items]);
      setCursor(result.nextCursor);
    });

  const duration = (ms: number) => {
    const seconds = Math.round(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    return minutes === 0
      ? t("durationSeconds", { seconds })
      : t("durationMinutes", { minutes, seconds: seconds % 60 });
  };

  return (
    <>
      <table aria-label={t("tableLabel")} className="mt-6 w-full text-sm">
        <thead className="border-b text-left text-muted">
          <tr>
            <th className="py-2 pr-4 font-medium">{t("startedAt")}</th>
            <th className="py-2 pr-4 text-right font-medium">
              {t("sourcesChecked")}
            </th>
            <th className="py-2 pr-4 text-right font-medium">
              {t("newVacancies")}
            </th>
            <th className="py-2 pr-4 text-right font-medium">
              {t("removedVacancies")}
            </th>
            <th className="py-2 text-right font-medium">{t("duration")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((run) => (
            // The row under the mouse is highlighted, like a vacancy row: the
            // columns are far apart, and without it the row is hard to follow (audit, B6).
            <tr key={run.id} className="transition-colors hover:bg-surface">
              {/* An absolute date in the locale and time zone from the next-intl
                  config (src/i18n/request.ts). */}
              <td className="py-2 pr-4">
                {format.dateTime(run.startedAt, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {run.sourcesChecked}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {run.newVacancies}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {run.removedVacancies}
              </td>
              <td className="py-2 text-right tabular-nums">
                {duration(run.durationMs)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {cursor === null ? null : (
        <div className="mt-6 flex justify-center">
          <Button variant="secondary" isPending={isPending} onPress={loadMore}>
            {/* HeroUI `isPending` only disables the button - we draw the spinner ourselves. */}
            {({ isPending: isLoading }) => (
              <>
                {isLoading ? <Spinner color="current" size="sm" /> : null}
                {t("loadMore")}
              </>
            )}
          </Button>
        </div>
      )}
    </>
  );
}
