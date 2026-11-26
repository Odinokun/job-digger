"use client";

import { Checkbox, Chip } from "@heroui/react";
import { useTranslations } from "next-intl";

import { knownAtsName } from "@/lib/companies/known-ats";
import type { CareerPlatform } from "@/lib/companies/platform";
import type { Finding } from "@/server/discovery/discover";

import type { FoundPage } from "./form-state";

interface FoundPagesProps {
  findings: FoundPage[];
  /** The addresses of the chosen findings. */
  selected: string[];
  onToggle: (url: string, isSelected: boolean) => void;
  platformLabels: Record<CareerPlatform, string>;
}

/**
 * The list of Find pages findings in the Add company modal
 * (src/server/discovery/README.md): the platform, the address and the result of
 * the trial read.
 *
 * The checkbox is a real `<input name="foundUrl">` (HeroUI passes `name` and
 * `value` to the React Aria field), so the chosen addresses go to Save with the
 * form by themselves. A finding that cannot be read cannot be chosen. Neither can
 * one already tracked by another company: Save would refuse it with
 * `source-taken` anyway (task 5.08).
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
                    {/* An own page is not a platform, so it has its own caption:
                        "Own page - not supported yet".
                        A known ATS without a parser shows its name (task 5.15). */}
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
            {/* The address is outside `Checkbox.Content`: that is a `<label>`
                with `select-none`, so a click inside would toggle the checkbox
                and the text could not be selected. Here it can be opened and
                copied to check the finding before choosing it (task 6.15). The
                `pl-7` indent = the `size-4` checkbox + the `gap-3` gap, so the
                address sits under the platform name. */}
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
 * The ownership note of a finding by name (task 5.05). A finding from the site
 * has no note: the link from the site is the proof.
 *
 * - the board leads to the company site - just a quiet caption, the finding is
 *   reliable;
 * - the board names another site as its own - a warning naming it: a company
 *   may have several domains, so a person decides;
 * - nothing is known - "check".
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
