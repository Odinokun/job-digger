"use client";

import { toast } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { markCheckSummaryShownAction } from "./check-actions";
import { useCheckStatus } from "./check-status-provider";

/**
 * Підсумок загальної перевірки (docs/checks-and-queue.md, розділ 8): спливає,
 * коли опитування приносить непоказаний підсумок, - одразу після кінця
 * перевірки або при наступному відкритті застосунку. Toast не закривається
 * сам: перевірка могла тривати хвилини, і числа мають дочекатися користувача.
 *
 * Показано - позначається на сервері, тож при наступному завантаженні не
 * повториться. `shown` рятує від повтору в цій вкладці, поки позначка ще йде.
 */
export function CheckSummary() {
  const t = useTranslations("CheckSummary");
  const { status } = useCheckStatus();
  const summary = status?.summary ?? null;
  const shown = useRef(new Set<string>());

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
      timeout: 0,
    });
    void markCheckSummaryShownAction(summary.runId);
  }, [summary, t]);

  return null;
}
