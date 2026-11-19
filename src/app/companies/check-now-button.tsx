"use client";

import { Button, Spinner, toast, Tooltip } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useTransition } from "react";

import { useCheckStatus } from "@/app/components/check-status-provider";
import { TOOLTIP_DELAY_MS } from "@/app/components/icon-button";
import { useActionFailedToast } from "@/app/components/use-action-failed-toast";
import type {
  CompaniesTab,
  CompanyListItem,
} from "@/lib/companies/company-list";

import { checkCompanyNowAction } from "./actions";

interface CheckNowButtonProps {
  companyId: string;
  tab: CompaniesTab;
  /** Перевірка завершилася: рядок компанії після неї або `null`, якщо її вже немає. */
  onChecked: (companyId: string, checked: CompanyListItem | null) => void;
  /**
   * Почати перевірку одразу, без натискання: перша перевірка щойно доданої
   * компанії (задача 5.09). Один раз за життя кнопки.
   */
  startsOnMount?: boolean;
}

/**
 * Check now у картці компанії (docs/ui.md, розділ 4.2): перевіряє всі її
 * джерела. Поки черги немає, дія чекає, доки прочитаються всі джерела, тож
 * кнопка весь цей час у стані `isPending` зі спінером. Сам `isPending` у HeroUI
 * лише вимикає кнопку, тож спінер малюємо самі (документація Button, приклад
 * Loading).
 */
export function CheckNowButton({
  companyId,
  tab,
  onChecked,
  startsOnMount = false,
}: CheckNowButtonProps) {
  const t = useTranslations("CompaniesPage");
  const showActionFailed = useActionFailedToast();
  const [isPending, startCheck] = useTransition();
  const { status } = useCheckStatus();
  // Під час загальної перевірки компанія і так перевіряється
  // (docs/checks-and-queue.md, розділ 8).
  const isGeneralCheckRunning = (status?.run ?? null) !== null;

  function check() {
    startCheck(async () => {
      const result = await checkCompanyNowAction(companyId, tab);

      if (!result.ok) {
        if (result.reason === "check-running") {
          toast.warning(t("generalCheckRunning"));
        } else {
          showActionFailed();
        }
        return;
      }

      onChecked(companyId, result.company);
    });
  }

  // Ref, а не залежності ефекту: Strict Mode у розробці ставить ефект двічі, і
  // без нього перша перевірка пішла б двома запитами.
  const started = useRef(false);
  const latestCheck = useRef(check);
  useEffect(() => {
    latestCheck.current = check;
  });
  useEffect(() => {
    if (startsOnMount && !started.current) {
      started.current = true;
      latestCheck.current();
    }
  }, [startsOnMount]);

  const button = (
    <Button
      size="sm"
      variant="secondary"
      isDisabled={isGeneralCheckRunning}
      isPending={isPending}
      onPress={check}
    >
      {({ isPending: isChecking }) => (
        <>
          {isChecking ? <Spinner color="current" size="sm" /> : null}
          {t("checkNow")}
        </>
      )}
    </Button>
  );

  if (!isGeneralCheckRunning) {
    return button;
  }

  // Вимкнена кнопка не отримує наведення, тож підказку тримає обгортка
  // (документація HeroUI, Tooltip.Trigger).
  return (
    <Tooltip delay={TOOLTIP_DELAY_MS}>
      <Tooltip.Trigger>{button}</Tooltip.Trigger>
      <Tooltip.Content>
        <p>{t("generalCheckRunning")}</p>
      </Tooltip.Content>
    </Tooltip>
  );
}
