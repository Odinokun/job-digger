"use client";

import { Button, Spinner, toast } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { useCheckStatus } from "@/app/components/check-status-provider";
import { useActionFailedToast } from "@/app/components/use-action-failed-toast";

import { startFindNewPagesAction } from "./actions";

interface FindNewPagesButtonProps {
  /** The Not tracked tab is empty - nothing to search for. */
  isDisabled: boolean;
}

/**
 * Find new pages on the Not tracked tab (task 5.10). The action only queues the
 * search; while it runs, the button spins - it has no run with progress in the
 * header. When the search ends, `CompaniesBoard` re-reads the list.
 */
export function FindNewPagesButton({ isDisabled }: FindNewPagesButtonProps) {
  const t = useTranslations("CompaniesPage");
  const showActionFailed = useActionFailedToast();
  const { status, track } = useCheckStatus();
  // It cannot be started again while the previous one is running.
  const isFinding = status?.findingNewPages ?? false;
  const [isPending, startFinding] = useTransition();

  return (
    <Button
      variant="secondary"
      isDisabled={isDisabled}
      isPending={isPending || isFinding}
      onPress={() =>
        startFinding(async () => {
          const result = await startFindNewPagesAction();

          if (result.ok) {
            // The state from the response starts polling.
            track(result.status);
          } else if (result.reason === "already-running") {
            toast.warning(t("findNewPagesRunning"));
          } else if (result.reason === "nothing-to-search") {
            toast.warning(t("findNewPagesNothing"));
          } else {
            showActionFailed();
          }
        })
      }
    >
      {({ isPending: isSearching }) => (
        <>
          {isSearching ? <Spinner color="current" size="sm" /> : null}
          {t("findNewPages")}
        </>
      )}
    </Button>
  );
}
