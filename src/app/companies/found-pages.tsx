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
 * Знахідку, яка не читається, вибрати не можна. Знахідка за назвою позначена:
 * дошку з такою назвою могла завести інша компанія.
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
              isDisabled={finding.vacancies === null}
              onChange={(isSelected) => onToggle(finding.url, isSelected)}
            >
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <span className="flex min-w-0 flex-col">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {platformLabels[finding.platform]}
                    </span>
                    <span className="text-sm text-muted">
                      {finding.vacancies === null
                        ? t("notReadable")
                        : t("vacancies", { count: finding.vacancies })}
                    </span>
                    {finding.via === "name" ? (
                      <Chip size="sm" color="warning" variant="primary">
                        {t("byName")}
                      </Chip>
                    ) : null}
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
