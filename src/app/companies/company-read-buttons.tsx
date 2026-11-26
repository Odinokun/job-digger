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
 * Mark all as read і Mark all as unread у картці компанії: змінюють статус усіх активних вакансій компанії. Діалогу
 * підтвердження немає - дію легко скасувати протилежною.
 *
 * На сторінці Companies після дії нічого видимо не змінюється, тому результат
 * показує сповіщення з кількістю. Іконки - пара конвертів, як у поштових
 * клієнтах: відкритий - позначити прочитаним, закритий - непрочитаним (аудит
 * інтерфейсу, C1: подвійна галочка поруч із конвертом читалась як загадка).
 * Кнопки лише з іконкою - `IconButton`, з підказкою при наведенні.
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
