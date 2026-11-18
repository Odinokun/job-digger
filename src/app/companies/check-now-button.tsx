"use client";

import { Button } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

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
}

/**
 * Check now у картці компанії (docs/ui.md, розділ 4.2): перевіряє всі її
 * джерела. Поки черги немає, дія чекає, доки прочитаються всі джерела, тож
 * кнопка весь цей час у стані `isPending`. Повніші стани завантаження -
 * задача 3.21.
 */
export function CheckNowButton({
  companyId,
  tab,
  onChecked,
}: CheckNowButtonProps) {
  const t = useTranslations("CompaniesPage");
  const showActionFailed = useActionFailedToast();
  const [isPending, startCheck] = useTransition();

  return (
    <Button
      size="sm"
      variant="secondary"
      isPending={isPending}
      onPress={() =>
        startCheck(async () => {
          const result = await checkCompanyNowAction(companyId, tab);

          if (!result.ok) {
            showActionFailed();
            return;
          }

          onChecked(companyId, result.company);
        })
      }
    >
      {t("checkNow")}
    </Button>
  );
}
