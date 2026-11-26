"use client";

import { Envelope, EnvelopeOpen } from "@gravity-ui/icons";
import { toast } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { IconButton } from "@/app/components/icon-button";
import { useActionFailedToast } from "@/app/components/use-action-failed-toast";

import { setCompanyVacanciesReadAction } from "./actions";

interface CompanyReadButtonsProps {
  companyId: string;
  companyName: string;
}

/**
 * Mark all as read and Mark all as unread on a company card: they change the
 * status of every active vacancy of the company. There is no confirmation
 * dialog - the opposite action undoes it easily.
 *
 * Nothing visible changes on the Companies page after the action, so a
 * notification with the count shows the result. The icons are a pair of
 * envelopes, as in mail clients: an open one marks as read, a closed one as
 * unread (UI audit, C1: a double tick next to an envelope read as a riddle).
 * Icon-only buttons are `IconButton`, with a tooltip on hover.
 */
export function CompanyReadButtons({
  companyId,
  companyName,
}: CompanyReadButtonsProps) {
  const t = useTranslations("CompaniesPage.companyRead");
  const showActionFailed = useActionFailedToast();
  const [isPending, startMark] = useTransition();

  const mark = (isRead: boolean) =>
    startMark(async () => {
      const result = await setCompanyVacanciesReadAction(companyId, isRead);

      if (!result.ok) {
        showActionFailed();
        return;
      }

      toast.success(
        t(isRead ? "markedRead" : "markedUnread", {
          count: result.changed,
          name: companyName,
        }),
      );
    });

  return (
    <>
      <IconButton
        size="sm"
        variant="tertiary"
        label={t("markRead")}
        isDisabled={isPending}
        onPress={() => mark(true)}
      >
        <EnvelopeOpen />
      </IconButton>
      <IconButton
        size="sm"
        variant="tertiary"
        label={t("markUnread")}
        isDisabled={isPending}
        onPress={() => mark(false)}
      >
        <Envelope />
      </IconButton>
    </>
  );
}
