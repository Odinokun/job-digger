"use client";

import { Checkbox, Chip } from "@heroui/react";
import { useTranslations } from "next-intl";

import { knownAtsName } from "@/lib/companies/known-ats";
import type { CareerPlatform } from "@/lib/companies/platform";
import type { Finding } from "@/server/discovery/discover";

import type { FoundPage } from "./form-state";

interface FoundPagesProps {
  findings: FoundPage[];
  /** Адреси вибраних знахідок. */
  selected: string[];
  onToggle: (url: string, isSelected: boolean) => void;
  platformLabels: Record<CareerPlatform, string>;
}

/**
 * Список знахідок Find pages у модалці Add company
 * (src/server/discovery/README.md): платформа, адреса і
 * результат пробного читання.
 *
 * Галочка - справжній `<input name="foundUrl">` (HeroUI передає `name` і
 * `value` у поле React Aria), тож вибрані адреси їдуть із формою на Save самі.
 * Знахідку, яка не читається, вибрати не можна. Ту, що вже відстежується в
 * іншій компанії, - теж: Save однаково відмовив би `source-taken` (задача 5.08).
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
      <p id="found-pages-title" className="text-sm font-semibold">
        {t("title")}
      </p>
      <ul aria-labelledby="found-pages-title" className="flex flex-col gap-3">
        {findings.map((finding) => (
          <li key={finding.url}>
            <Checkbox
              name="foundUrl"
              value={finding.url}
              isSelected={selected.includes(finding.url)}
              isDisabled={
                finding.trial.kind !== "read" || finding.trackedIn !== null
              }
              onChange={(isSelected) => onToggle(finding.url, isSelected)}
            >
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <span className="flex min-w-0 flex-col">
                  <span className="flex flex-wrap items-center gap-2">
                    {/* Власна сторінка - не платформа, тож і підпис свій:
                        «Own page - not supported yet».
                        Відома ATS без парсера - її назва (задача 5.15). */}
                    <span className="font-medium">
                      {finding.platform === "unsupported"
                        ? (knownAtsName(finding.url) ?? t("ownPage"))
                        : platformLabels[finding.platform]}
                    </span>
                    <span className="text-sm text-muted">
                      {finding.trial.kind === "read"
                        ? finding.trial.more
                          ? t("vacanciesMore", {
                              count: finding.trial.vacancies,
                            })
                          : t("vacancies", { count: finding.trial.vacancies })
                        : finding.trial.kind === "unsupported"
                          ? t("notSupported")
                          : t("readFailed")}
                    </span>
                    <OwnershipMark finding={finding} />
                    {finding.trackedIn === null ? null : (
                      <Chip size="sm" color="warning" variant="primary">
                        {t("alreadyTracked", { name: finding.trackedIn.name })}
                      </Chip>
                    )}
                  </span>
                </span>
              </Checkbox.Content>
            </Checkbox>
            {/* Адреса - поза `Checkbox.Content`: той є `<label>` із
                `select-none`, тож усередині клік перемикав би галочку, а
                текст не виділявся б. Тут її можна відкрити й скопіювати, щоб
                перевірити знахідку перед вибором (задача 6.15). Відступ
                `pl-7` = галочка `size-4` + проміжок `gap-3`, адреса стоїть
                під назвою платформи. */}
            <a
              href={finding.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block pl-7 font-mono text-sm break-all text-muted underline underline-offset-2"
            >
              {finding.url}
            </a>
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
