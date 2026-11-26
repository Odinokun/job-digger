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
 * The company status on the Tracked tab: OK, Has errors or Checking, together
 * with the unread pages. One coloured badge per card (UI audit, A6; which one -
 * `cardStatusBadge`), the rest in muted text. Status badges are solid in the Ink
 * theme (src/app/README.md, "Ink theme"). Before the first check and without
 * unread pages - nothing.
 *
 * Checking during a general check comes from polling: the check takes every
 * Tracked company, and the list rows live in client state and do not update
 * themselves.
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
 * How many of the company's pages we do not read (task 6.11). An attention
 * badge, not Has errors: Unsupported is a permanent state that Retry does not
 * fix. Solid, like the other status badges (src/app/README.md, "Ink theme").
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
