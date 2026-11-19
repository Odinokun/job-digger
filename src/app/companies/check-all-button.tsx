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
 * повертається, тож спінер видно мить; саму перевірку веде цикл черги. Поки
 * немає індикатора прогресу в шапці (задача 4.05), про старт каже toast.
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
            // Стан із відповіді запускає опитування одразу.
            track(result.status);
            toast(t("checkAllStarted", { count: result.total }));
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
