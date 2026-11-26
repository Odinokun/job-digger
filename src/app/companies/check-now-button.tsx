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
  /** The check has finished: the company row after it, or `null` if the company is gone. */
  onChecked: (companyId: string, checked: CompanyListItem | null) => void;
  /**
   * Start the check at once, without a click: the first check of a freshly
   * added company (task 5.09). Once in the button's lifetime.
   */
  startsOnMount?: boolean;
}

/**
 * Check now on a company card: checks all of its sources. The action waits until
 * every source is read, so the button stays in the `isPending` state with a
 * spinner all that time. HeroUI `isPending` only disables the button, so we draw
 * the spinner ourselves (Button docs, the Loading example).
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
  // During a general check the company is being checked anyway
  // (src/server/checks/README.md).
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

  // A ref, not effect dependencies: Strict Mode in development runs the effect
  // twice, and without it the first check would go out as two requests.
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

  // A disabled button gets no hover, so a wrapper holds the tooltip
  // (HeroUI docs, Tooltip.Trigger).
  return (
    <Tooltip delay={TOOLTIP_DELAY_MS}>
      <Tooltip.Trigger>{button}</Tooltip.Trigger>
      <Tooltip.Content>
        <p>{t("generalCheckRunning")}</p>
      </Tooltip.Content>
    </Tooltip>
  );
}
