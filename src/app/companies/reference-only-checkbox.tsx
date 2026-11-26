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
 * The "Link only" checkbox on the row of a page nothing can read (task 6.17).
 *
 * When ticked, the page stays on the card as a link but does not count as
 * unread: it leaves Needs attention and the "N pages not read" badge. A checkbox,
 * not a button, because this is a state that is visible and can be undone, not a
 * one-off action.
 *
 * The action returns the company row for the current tab; on Needs attention it
 * can be `null`, and the list removes the company, as after Edit.
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
