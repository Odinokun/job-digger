"use client";

import { Button, Spinner, toast } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { useCheckStatus } from "@/app/components/check-status-provider";
import { useActionFailedToast } from "@/app/components/use-action-failed-toast";

import { startCheckAllAction } from "./actions";

interface CheckAllButtonProps {
  /** Вкладка Tracked порожня - перевіряти нічого (docs/ui.md, розділ 4.2). */
  isDisabled: boolean;
}

/**
 * Check all на вкладці Tracked. Дія лише ставить джерела в чергу й одразу
 * повертається, тож спінер видно мить; саму перевірку веде цикл черги, а хід
 * показує індикатор у шапці (`components/check-progress.tsx`).
 */
export function CheckAllButton({ isDisabled }: CheckAllButtonProps) {
  const t = useTranslations("CompaniesPage");
  const showActionFailed = useActionFailedToast();
  const { track } = useCheckStatus();
  const [isPending, startCheck] = useTransition();

  return (
    <Button
      variant="secondary"
      isDisabled={isDisabled}
      isPending={isPending}
      onPress={() =>
        startCheck(async () => {
          const result = await startCheckAllAction();

          if (result.ok) {
            // Стан із відповіді показує індикатор у шапці одразу й
            // запускає опитування.
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
