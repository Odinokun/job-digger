"use client";

import { Chip, Spinner } from "@heroui/react";
import { useTranslations } from "next-intl";

import { useCheckStatus } from "@/app/components/check-status-provider";
import {
  notReadSourceCount,
  type CompanySource,
} from "@/lib/companies/company-list";
import {
  cardStatusBadge,
  companyCheckStatus,
} from "@/lib/companies/company-status";

/**
 * Статус компанії на вкладці Tracked: OK, Has errors або Checking,
 * разом із непрочитаними сторінками. Кольоровий бейдж
 * один на картку (аудит інтерфейсу, A6; хто його отримує - `cardStatusBadge`),
 * решта - приглушеним текстом. Бейджі статусів у темі Ink суцільні
 * (src/app/README.md, «Тема Ink»). До першої перевірки й без непрочитаних
 * сторінок - нічого.
 *
 * Checking під час загальної перевірки береться з опитування: вона бере всі
 * компанії Tracked, а рядки списку живуть у клієнтському стані й самі не
 * оновлюються.
 */
export function CompanyStatusChip({ sources }: { sources: CompanySource[] }) {
  const t = useTranslations("CompaniesPage");
  const { status } = useCheckStatus();
  const notRead = notReadSourceCount(sources);
  const { badge, notReadAsText } = cardStatusBadge(
    companyCheckStatus(sources, {
      isGeneralCheckRunning: (status?.run ?? null) !== null,
    }),
    notRead,
  );

  return (
    <>
      {badge === "checking" ? (
        <Chip size="sm" className="bg-info text-info-foreground">
          <Spinner color="current" size="sm" />
          {t("checkStatus.checking")}
        </Chip>
      ) : badge === "has-errors" ? (
        <Chip size="sm" color="danger" variant="primary">
          {t("checkStatus.hasErrors")}
        </Chip>
      ) : badge === "not-read" ? (
        <NotReadChip sources={sources} />
      ) : badge === "ok" ? (
        <Chip size="sm" color="success" variant="primary">
          {t("checkStatus.ok")}
        </Chip>
      ) : null}
      {notReadAsText ? (
        <span className="text-hint text-muted">
          {t("notRead", { count: notRead })}
        </span>
      ) : null}
    </>
  );
}

/**
 * Скільки сторінок компанії ми не читаємо (задача 6.11). Бейдж уваги, а не Has
 * errors: Unsupported - постійний стан, Retry його не лагодить. Суцільний, як
 * решта бейджів статусу (src/app/README.md, «Тема Ink»).
 */
export function NotReadChip({ sources }: { sources: CompanySource[] }) {
  const t = useTranslations("CompaniesPage");
  const count = notReadSourceCount(sources);

  if (count === 0) return null;

  return (
    <Chip size="sm" className="bg-highlight text-highlight-foreground">
      {t("notRead", { count })}
    </Chip>
  );
}
