"use client";

import { CheckDouble, Envelope } from "@gravity-ui/icons";
import { Button, toast } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { useActionFailedToast } from "@/app/components/use-action-failed-toast";

import { setCompanyVacanciesReadAction } from "./actions";

interface CompanyReadButtonsProps {
  companyId: string;
  companyName: string;
}

/**
 * Mark all as read і Mark all as unread у картці компанії (docs/ui.md,
 * розділ 4.2): змінюють статус усіх активних вакансій компанії. Діалогу
 * підтвердження немає - дію легко скасувати протилежною.
 *
 * На сторінці Companies після дії нічого видимо не змінюється, тому результат
 * показує сповіщення з кількістю. Іконки - ті самі, що в рядку вакансії
 * (`_jobs/vacancy-actions.tsx`), лише прочитане - подвійна галочка. Кнопки лише
 * з іконкою, тож `aria-label` обовʼязковий, як у кошика.
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
      <Button
        isIconOnly
        size="sm"
        variant="tertiary"
        aria-label={t("markRead")}
        isDisabled={isPending}
        onPress={() => mark(true)}
      >
        <CheckDouble />
      </Button>
      <Button
        isIconOnly
        size="sm"
        variant="tertiary"
        aria-label={t("markUnread")}
        isDisabled={isPending}
        onPress={() => mark(false)}
      >
        <Envelope />
      </Button>
    </>
  );
}
