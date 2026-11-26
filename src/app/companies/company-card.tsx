import { Card } from "@heroui/react";
import { useTranslations } from "next-intl";

import {
  isNotReadSource,
  isTrackedCompany,
  type CompaniesTab,
  type CompanyListItem,
  type CompanySource,
} from "@/lib/companies/company-list";
import { knownAtsName } from "@/lib/companies/known-ats";

import { CheckNowButton } from "./check-now-button";
import { CompanyStatusChip, NotReadChip } from "./company-status-chip";
import { CompanyReadButtons } from "./company-read-buttons";
import { DeleteCompanyDialog } from "./delete-company-dialog";
import { EditCompanyDialog } from "./edit-company-dialog";
import { FindPagesDialog } from "./find-pages-dialog";
import { LastChecked } from "./last-checked";
import { OwnPageDialog } from "./own-page-dialog";
import { ReferenceOnlyCheckbox } from "./reference-only-checkbox";

interface CompanyCardProps {
  company: CompanyListItem;
  /** The list tab: the Edit modal returns the row for exactly this tab. */
  tab: CompaniesTab;
  /** The status caption - only where it means something, that is for a Not tracked company. */
  statusLabel?: string;
  noSourcesLabel: string;
  platformLabels: Record<CompanySource["platform"], string>;
  onSaved: (companyId: string, saved: CompanyListItem | null) => void;
  onDeleted: (companyId: string) => void;
  /**
   * An own page got a recipe (task 6.21): the row for the tab and the first
   * check - as after Add company.
   */
  onRecipeApplied: (company: CompanyListItem | null, companyId: string) => void;
  /** Just added: Check now starts by itself (task 5.09). */
  startsCheck?: boolean;
}

/**
 * One row of the company list.
 *
 * The check status and the last check time appear after the first check:
 * before it there is nothing to show, and an empty "0 vacancies" would mislead.
 */
export function CompanyCard({
  company,
  tab,
  statusLabel,
  noSourcesLabel,
  platformLabels,
  onSaved,
  onDeleted,
  onRecipeApplied,
  startsCheck = false,
}: CompanyCardProps) {
  return (
    <Card>
      <Card.Header>
        {/* The company name uses the heading font, not the body one: in the
            "Ink" theme this is the only thing that sets data apart from UI labels. */}
        <Card.Title className="font-display text-lg font-semibold tracking-tight">
          {company.name}
        </Card.Title>
        <Card.Description>
          {/* An external link: rel is required (CLAUDE.md, "Security"). */}
          <a
            href={company.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            {company.url}
          </a>
        </Card.Description>
      </Card.Header>

      <Card.Content>
        {company.sources.length === 0 ? (
          <p className="text-sm text-muted">{noSourcesLabel}</p>
        ) : (
          // The gap between sources is bigger than inside a source: it shows
          // where one ends and the next begins (UI audit, B1).
          <ul className="flex flex-col gap-4 text-sm">
            {company.sources.map((source) => (
              <li key={source.id} className="flex min-w-0 flex-col gap-0.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  {/* A known ATS without a parser shows its name instead of
                      "Unsupported" (task 5.15): that shows which parsers are
                      needed. A page we do not read is labelled in the attention
                      colour (task 6.11, audit A6): yellow in both themes, red is
                      only for errors. One marked "link only" uses the normal
                      colour (task 6.17). */}
                  <span
                    className={
                      isNotReadSource(source)
                        ? "font-medium text-attention"
                        : "font-medium"
                    }
                  >
                    {knownAtsName(source.url) ??
                      platformLabels[source.platform]}
                  </span>
                  {/* The label tells sources of one site apart: three
                      mozilla.org filters differ only in the `query` at the end
                      of a long address (task 2.16). */}
                  {source.label === null ? null : <span>{source.label}</span>}
                  {/* After a failure the source's vacancies are not deleted, and
                      without the date of the last success dead sources would
                      look alive. */}
                  {source.isTracked && source.lastCheck === "failed" ? (
                    source.lastSuccessAt === null ? (
                      <NeverOk />
                    ) : (
                      <LastChecked at={source.lastSuccessAt} message="lastOk" />
                    )
                  ) : null}
                </div>
                {/* The address always goes under the status line and on one
                    line (audit B1): with filters it can run to four or five
                    lines. The full address is in the browser tooltip (`title`)
                    and in the browser status bar on hover; Edit shows it in full. */}
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={source.url}
                  className="truncate text-muted underline underline-offset-2"
                >
                  {source.url}
                </a>
                {/* A page nothing can read can be read as a list with a recipe
                    (task 6.21) or kept as a link (6.17); an own page can change
                    its recipe. The source actions form one group under the
                    address, the same for every source. */}
                {source.platform === "unsupported" ||
                source.platform === "own_page" ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <OwnPageDialog
                      companyId={company.id}
                      source={source}
                      tab={tab}
                      onApplied={onRecipeApplied}
                    />
                    {source.platform === "unsupported" ? (
                      <ReferenceOnlyCheckbox
                        companyId={company.id}
                        source={source}
                        tab={tab}
                        onSaved={onSaved}
                      />
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card.Content>

      {/* Card actions. */}
      <Card.Footer className="flex flex-wrap items-center justify-between gap-2">
        {/* On the left: the status on Not tracked, or the last check time on
            Tracked - on Not tracked there is nothing to check. */}
        {statusLabel !== undefined ? (
          <div className="flex flex-wrap items-center gap-2">
            <NotReadChip sources={company.sources} />
            <span className="text-sm text-muted">{statusLabel}</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {/* One coloured badge per card (audit A6): `CompanyStatusChip`
                itself combines the check status and "not read". */}
            <CompanyStatusChip sources={company.sources} />
            {company.lastCheckedAt === null ? null : (
              <LastChecked at={company.lastCheckedAt} />
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          {/* The company decides the actions, not the tab: Needs attention
              mixes Tracked and Not tracked (task 6.11). */}
          {isTrackedCompany(company.sources) ? (
            <CheckNowButton
              companyId={company.id}
              tab={tab}
              onChecked={onSaved}
              startsOnMount={startsCheck}
            />
          ) : (
            // On Not tracked there is nothing to check - instead of Check now,
            // a page search for this company.
            <FindPagesDialog
              company={company}
              tab={tab}
              platformLabels={platformLabels}
              onSaved={onSaved}
            />
          )}
          {/* Mark all as read / unread - only when there is something to mark. */}
          {company.vacancies.total > 0 ? (
            <CompanyReadButtons
              companyId={company.id}
              companyName={company.name}
            />
          ) : null}
          <EditCompanyDialog
            company={company}
            tab={tab}
            platformLabels={platformLabels}
            onSaved={onSaved}
          />
          <DeleteCompanyDialog company={company} onDeleted={onDeleted} />
        </div>
      </Card.Footer>
    </Card>
  );
}

/** A failed source that has never been checked successfully. */
function NeverOk() {
  const t = useTranslations("CompaniesPage");

  return <span className="text-sm text-danger">{t("neverOk")}</span>;
}
