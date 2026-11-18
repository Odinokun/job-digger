"use client";

import { Button, Spinner } from "@heroui/react";
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
 * кнопка весь цей час у стані `isPending` зі спінером. Сам `isPending` у HeroUI
 * лише вимикає кнопку, тож спінер малюємо самі (документація Button, приклад
 * Loading).
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
      {({ isPending: isChecking }) => (
        <>
          {isChecking ? <Spinner color="current" size="sm" /> : null}
          {t("checkNow")}
        </>
      )}
    </Button>
  );
}
