"use client";

import { Spinner } from "@heroui/react";
import { useTranslations } from "next-intl";

import { useCheckStatus } from "./check-status-provider";

/**
 * The general check indicator in the header: "Checking 37/120"
 * (src/server/checks/README.md). The counter is the checked sources including
 * the failed ones. It shows only while a run is active; polling gives the state
 * (`check-status-provider.tsx`), and after Check all its response does, so the
 * indicator appears at once.
 */
export function CheckProgress() {
  const t = useTranslations("Nav");
  const { status } = useCheckStatus();
  const run = status?.run;

  return (
    // The live region always exists and only its text appears: a screen reader
    // announces a change only in a region that was already on the page.
    <div role="status" className="ml-auto text-sm text-muted">
      {run ? (
        <span className="flex items-center gap-2">
          <Spinner color="current" size="sm" />
          {t("checking", { checked: run.checked, total: run.total })}
        </span>
      ) : null}
    </div>
  );
}
