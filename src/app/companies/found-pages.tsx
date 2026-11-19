"use client";

import { Checkbox, Chip } from "@heroui/react";
import { useTranslations } from "next-intl";

import type { CareerPlatform } from "@/lib/companies/platform";
import type { Finding } from "@/server/discovery/discover";

interface FoundPagesProps {
  findings: Finding[];
  /** Адреси вибраних знахідок. */
  selected: string[];
  onToggle: (url: string, isSelected: boolean) => void;
  platformLabels: Record<CareerPlatform, string>;
}

/**
 * Список знахідок Find pages у модалці Add company
 * (docs/discovery-and-parsing.md, розділ 5, пункт 5): платформа, адреса і
 * результат пробного читання.
 *
 * Галочка - справжній `<input name="foundUrl">` (HeroUI передає `name` і
 * `value` у поле React Aria), тож вибрані адреси їдуть із формою на Save самі.
 * Знахідку, яка не читається, вибрати не можна.
 */
export function FoundPages({
  findings,
  selected,
  onToggle,
  platformLabels,
}: FoundPagesProps) {
  const t = useTranslations("CompaniesPage.addCompany.found");

  if (findings.length === 0) {
    return <p className="text-sm text-muted">{t("nothing")}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <p id="found-pages-title" className="text-sm font-medium">
        {t("title")}
      </p>
      <ul aria-labelledby="found-pages-title" className="flex flex-col gap-3">
        {findings.map((finding) => (
          <li key={finding.url}>
            <Checkbox
              name="foundUrl"
              value={finding.url}
              isSelected={selected.includes(finding.url)}
              isDisabled={finding.trial.kind !== "read"}
              onChange={(isSelected) => onToggle(finding.url, isSelected)}
            >
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <span className="flex min-w-0 flex-col">
                  <span className="flex flex-wrap items-center gap-2">
                    {/* Власна сторінка - не платформа, тож і підпис свій:
                        «Own page - not supported yet» (розділ 5, пункт 5). */}
                    <span className="font-medium">
                      {finding.platform === "unsupported"
                        ? t("ownPage")
                        : platformLabels[finding.platform]}
                    </span>
                    <span className="text-sm text-muted">
                      {finding.trial.kind === "read"
                        ? t("vacancies", { count: finding.trial.vacancies })
                        : finding.trial.kind === "unsupported"
                          ? t("notSupported")
                          : t("readFailed")}
                    </span>
                    <OwnershipMark finding={finding} />
                  </span>
                  <span className="truncate font-mono text-sm text-muted">
                    {finding.url}
                  </span>
                </span>
              </Checkbox.Content>
            </Checkbox>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Позначка знахідки за назвою (задача 5.05). Знахідка з сайту позначки не має:
 * посилання з сайту і є доказом.
 *
 * - дошка веде на сайт компанії - лише тихий підпис, знахідка надійна;
 * - дошка називає своїм інший сайт - попередження з ним: у компанії буває
 *   кілька доменів, тож вирішує людина;
 * - нічого не відомо - «перевір».
 */
function OwnershipMark({ finding }: { finding: Finding }) {
  const t = useTranslations("CompaniesPage.addCompany.found");
  const ownership = finding.ownership;

  if (finding.via === "site" || ownership === null) {
    return null;
  }

  if (ownership.kind === "confirmed") {
    return <span className="text-sm text-muted">{t("byNameConfirmed")}</span>;
  }

  return (
    <Chip size="sm" color="warning" variant="primary">
      {ownership.kind === "other"
        ? t("byNameOther", { site: ownership.site })
        : t("byName")}
    </Chip>
  );
}
