"use client";

import { Chip, Spinner } from "@heroui/react";
import { useTranslations } from "next-intl";

import { useCheckStatus } from "@/app/components/check-status-provider";
import type { CompanySource } from "@/lib/companies/company-list";
import { companyCheckStatus } from "@/lib/companies/company-status";

/**
 * Статус компанії на вкладці Tracked: OK, Has errors або Checking
 * (docs/ui.md, розділ 4.2). Бейджі статусів у темі Ink - суцільні
 * (src/app/README.md, «Тема Ink»). До першої перевірки - нічого.
 *
 * Checking під час загальної перевірки береться з опитування: вона бере всі
 * компанії Tracked, а рядки списку живуть у клієнтському стані й самі не
 * оновлюються.
 */
export function CompanyStatusChip({ sources }: { sources: CompanySource[] }) {
  const t = useTranslations("CompaniesPage.checkStatus");
  const { status } = useCheckStatus();
  const checkStatus = companyCheckStatus(sources, {
    isGeneralCheckRunning: (status?.run ?? null) !== null,
  });

  if (checkStatus === null) return null;

  if (checkStatus === "checking") {
    return (
      <Chip size="sm" className="bg-info text-info-foreground">
        <Spinner color="current" size="sm" />
        {t("checking")}
      </Chip>
    );
  }

  return checkStatus === "ok" ? (
    <Chip size="sm" color="success" variant="primary">
      {t("ok")}
    </Chip>
  ) : (
    <Chip size="sm" color="danger" variant="primary">
      {t("hasErrors")}
    </Chip>
  );
}
