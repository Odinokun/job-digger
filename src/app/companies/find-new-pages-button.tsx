"use client";

import { Button, Spinner, toast } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { useCheckStatus } from "@/app/components/check-status-provider";
import { useActionFailedToast } from "@/app/components/use-action-failed-toast";

import { startFindNewPagesAction } from "./actions";

interface FindNewPagesButtonProps {
  /** Вкладка Not tracked порожня - шукати нічого. */
  isDisabled: boolean;
}

/**
 * Find new pages на вкладці Not tracked (задача 5.10). Дія лише ставить пошук
 * у чергу; поки він іде, кнопка крутить спінер - запуску з прогресом у шапці в
 * нього немає (рішення автора 19.11.2026). Коли пошук закінчився, список
 * перечитує `CompaniesBoard`.
 */
export function FindNewPagesButton({ isDisabled }: FindNewPagesButtonProps) {
  const t = useTranslations("CompaniesPage");
  const showActionFailed = useActionFailedToast();
  const { status, track } = useCheckStatus();
  // Повторно запустити, поки триває попередній, не можна (розділ 4.3).
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
            // Стан із відповіді запускає опитування.
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
