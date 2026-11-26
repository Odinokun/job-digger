"use client";

import { toast } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { markCheckSummaryShownAction } from "./check-actions";
import { useCheckStatus } from "./check-status-provider";
import { FailedSourcesDrawer } from "./failed-sources-drawer";

/**
 * The summary of a general check (src/server/checks/README.md): it pops up when
 * polling brings a summary not yet shown - right after the check ends or the
 * next time the app is opened.
 *
 * A successful summary closes by itself after `SUCCESS_SUMMARY_TIMEOUT_MS` (task
 * 6.19): 20 s is enough to read the numbers, and a hovering mouse pauses the
 * timer - HeroUI does that itself (`toast.js`: "Interacting with the stack
 * pauses every timer"). A summary with failed sources stays until it is closed:
 * it holds the Show failed button that leads to Retry.
 *
 * Being shown is recorded on the server, so the next load does not repeat it.
 * `shown` prevents a repeat in this tab while the mark is still on its way.
 */
/** How long a successful check summary stays. */
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
      // Failed sources - in the drawer with Retry.
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
