"use client";

import { toast } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { markCheckSummaryShownAction } from "./check-actions";
import { useCheckStatus } from "./check-status-provider";
import { FailedSourcesDrawer } from "./failed-sources-drawer";

/**
 * Підсумок загальної перевірки (docs/checks-and-queue.md, розділ 8): спливає,
 * коли опитування приносить непоказаний підсумок, - одразу після кінця
 * перевірки або при наступному відкритті застосунку.
 *
 * Успішний підсумок закривається сам через `SUCCESS_SUMMARY_TIMEOUT_MS`
 * (задача 6.19): 20 с вистачає прочитати числа, а наведена миша ставить таймер
 * на паузу - це робить сам HeroUI (`toast.js`: «Interacting with the stack
 * pauses every timer»). Підсумок із невдалими джерелами висить, доки його не
 * закриють: у ньому кнопка Show failed до Retry.
 *
 * Показано - позначається на сервері, тож при наступному завантаженні не
 * повториться. `shown` рятує від повтору в цій вкладці, поки позначка ще йде.
 */
/** Скільки висить успішний підсумок перевірки (рішення автора 20.11.2026). */
const SUCCESS_SUMMARY_TIMEOUT_MS = 20_000;

export function CheckSummary() {
  const t = useTranslations("CheckSummary");
  const { status } = useCheckStatus();
  const summary = status?.summary ?? null;
  const shown = useRef(new Set<string>());
  const [isDrawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (summary === null || shown.current.has(summary.runId)) return;
    shown.current.add(summary.runId);

    toast(t("title"), {
      description: t("description", {
        checked: summary.checked,
        ok: summary.checked - summary.failed,
        failed: summary.failed,
        newVacancies: summary.newVacancies,
        removedVacancies: summary.removedVacancies,
      }),
      variant: summary.failed > 0 ? "warning" : "success",
      timeout: summary.failed > 0 ? 0 : SUCCESS_SUMMARY_TIMEOUT_MS,
      // Невдалі джерела - у drawer з Retry.
      actionProps:
        summary.failed > 0
          ? {
              children: t("showFailed"),
              onPress: () => setDrawerOpen(true),
            }
          : undefined,
    });
    void markCheckSummaryShownAction(summary.runId);
  }, [summary, t]);

  return (
    <FailedSourcesDrawer isOpen={isDrawerOpen} onOpenChange={setDrawerOpen} />
  );
}
