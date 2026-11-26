"use client";

import { Button, Spinner, toast } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { useCheckStatus } from "@/app/components/check-status-provider";
import { useActionFailedToast } from "@/app/components/use-action-failed-toast";

import { startCheckAllAction } from "./actions";

interface CheckAllButtonProps {
  /** The Tracked tab is empty - nothing to check. */
  isDisabled: boolean;
}

/**
 * Check all on the Tracked tab. The action only queues the sources and returns
 * at once, so the spinner shows for a moment; the queue loop runs the check
 * itself, and the header indicator shows its progress
 * (`components/check-progress.tsx`).
 */
export function CheckAllButton({ isDisabled }: CheckAllButtonProps) {
  const t = useTranslations("CompaniesPage");
  const showActionFailed = useActionFailedToast();
  const { status, track } = useCheckStatus();
  // One general check per user: while it runs, a new one cannot start.
  const isRunning = (status?.run ?? null) !== null;
  const [isPending, startCheck] = useTransition();

  return (
    <Button
      variant="secondary"
      isDisabled={isDisabled || isRunning}
      isPending={isPending}
      onPress={() =>
        startCheck(async () => {
          const result = await startCheckAllAction();

          if (result.ok) {
            // The state from the response shows the header indicator at once and
            // starts polling.
            track(result.status);
          } else if (result.reason === "already-running") {
            toast.warning(t("checkAllRunning"));
          } else if (result.reason === "nothing-to-check") {
            toast.warning(t("checkAllNothing"));
          } else {
            showActionFailed();
          }
        })
      }
    >
      {({ isPending: isStarting }) => (
        <>
          {isStarting ? <Spinner color="current" size="sm" /> : null}
          {t("checkAll")}
        </>
      )}
    </Button>
  );
}
