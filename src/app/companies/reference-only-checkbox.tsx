"use client";

import { Checkbox } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { useActionFailedToast } from "@/app/components/use-action-failed-toast";
import type {
  CompaniesTab,
  CompanyListItem,
  CompanySource,
} from "@/lib/companies/company-list";

import { setSourceReferenceOnlyAction } from "./actions";

interface ReferenceOnlyCheckboxProps {
  companyId: string;
  source: CompanySource;
  tab: CompaniesTab;
  onSaved: (companyId: string, saved: CompanyListItem | null) => void;
}

/**
 * Галочка «Link only» у рядку сторінки, яку нічим прочитати (задача 6.17).
 *
 * Поставлена - сторінка лишається в картці посиланням, але не рахується
 * непрочитаною: зникає з Needs attention і бейджа «N pages not read». Галочка,
 * а не кнопка, бо це стан, який видно й можна зняти, а не разова дія.
 *
 * Відповідь дії - рядок компанії для поточної вкладки; на Needs attention він
 * буває `null`, і список прибирає компанію, як після Edit.
 */
export function ReferenceOnlyCheckbox({
  companyId,
  source,
  tab,
  onSaved,
}: ReferenceOnlyCheckboxProps) {
  const t = useTranslations("CompaniesPage.referenceOnly");
  const showActionFailed = useActionFailedToast();
  const [isPending, startSave] = useTransition();

  const save = (referenceOnly: boolean) =>
    startSave(async () => {
      const result = await setSourceReferenceOnlyAction(
        companyId,
        source.id,
        referenceOnly,
        tab,
      );

      if (!result.ok) {
        showActionFailed();
        return;
      }

      onSaved(companyId, result.company);
    });

  return (
    <Checkbox
      isSelected={source.isReferenceOnly}
      isDisabled={isPending}
      onChange={save}
    >
      <Checkbox.Content>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <span className="text-sm text-muted">{t("label")}</span>
      </Checkbox.Content>
    </Checkbox>
  );
}
