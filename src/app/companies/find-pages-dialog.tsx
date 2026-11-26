"use client";

import { Button, Modal, Spinner, useOverlayState } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { WithTooltip } from "@/app/components/icon-button";
import { useActionFailedToast } from "@/app/components/use-action-failed-toast";
import type {
  CompaniesTab,
  CompanyListItem,
  CompanySource,
} from "@/lib/companies/company-list";

import {
  addFoundPagesAction,
  checkCompanyNowAction,
  findPagesAction,
} from "./actions";
import { FoundPages } from "./found-pages";
import type { FoundPage } from "./form-state";
import { URL_ERROR_KEYS } from "./url-errors";

interface FindPagesDialogProps {
  company: CompanyListItem;
  tab: CompaniesTab;
  platformLabels: Record<CompanySource["platform"], string>;
  /** The saved row, or `null` if the company no longer belongs to the tab. */
  onSaved: (companyId: string, saved: CompanyListItem | null) => void;
}

/**
 * Find pages for an existing company - on a Not tracked card (task 5.14). The
 * same search and findings list as in the Add company modal, but by the
 * company's own site and name, so the search starts right when it opens.
 *
 * After Save a company with a readable source moves to Tracked and leaves this
 * list, so the first check runs without the Check now button - the same as after
 * Add company from the Not tracked tab (5.09).
 */
export function FindPagesDialog({
  company,
  tab,
  platformLabels,
  onSaved,
}: FindPagesDialogProps) {
  const t = useTranslations("CompaniesPage.findPages");
  const tShared = useTranslations("CompaniesPage");
  const tUrlError = useTranslations("CompaniesPage.urlErrors");
  const tCommon = useTranslations("Common");
  const showActionFailed = useActionFailedToast();
  const overlay = useOverlayState();
  const [findings, setFindings] = useState<FoundPage[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isFinding, startFinding] = useTransition();
  const [isSaving, startSaving] = useTransition();

  /** Opening resets the previous search and starts a new one. */
  function openDialog() {
    setFindings(null);
    setSelected([]);
    setError(null);
    overlay.open();

    startFinding(async () => {
      const result = await findPagesAction(
        company.url,
        company.name,
        company.id,
      );

      if (result.ok) {
        setFindings(result.findings);
      } else if (result.problem === "company-url") {
        setError(tUrlError(URL_ERROR_KEYS[result.reason]));
      } else {
        showActionFailed();
      }
    });
  }

  function toggle(url: string, isSelected: boolean) {
    setSelected((previous) =>
      isSelected
        ? [...previous, url]
        : previous.filter((picked) => picked !== url),
    );
  }

  function save() {
    setError(null);
    startSaving(async () => {
      const state = await addFoundPagesAction(company.id, selected, tab);

      if (state.status === "added") {
        onSaved(company.id, state.company);
        overlay.close();
        void checkCompanyNowAction(company.id, tab).then((result) => {
          if (!result.ok && result.reason !== "check-running") {
            showActionFailed();
          }
        });
        return;
      }

      if (state.status === "failed-unexpectedly") {
        showActionFailed();
        return;
      }

      const failure = state.result;
      // Between the search and Save the page may have been added to another
      // company or to this one: the refusals are the same as in the Add and Edit modals.
      setError(
        failure.problem === "source-taken"
          ? tShared("sourceTaken", { name: failure.company.name })
          : failure.problem === "source-duplicate"
            ? tShared("sourceDuplicate")
            : failure.problem === "source-url"
              ? tUrlError(URL_ERROR_KEYS[failure.reason])
              : tShared("editCompany.errors.notFound"),
      );
    });
  }

  return (
    <>
      <Button size="sm" variant="secondary" onPress={openDialog}>
        {t("open")}
      </Button>

      <Modal.Backdrop isOpen={overlay.isOpen} onOpenChange={overlay.setOpen}>
        <Modal.Container scroll="inside">
          <Modal.Dialog>
            <WithTooltip label={tCommon("close")}>
              <Modal.CloseTrigger aria-label={tCommon("close")} />
            </WithTooltip>
            <Modal.Header>
              <Modal.Heading>
                {t("title", { name: company.name })}
              </Modal.Heading>
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-4">
              {/* The search reads other sites with politeness pauses - that takes seconds. */}
              {isFinding ? (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Spinner color="current" size="sm" />
                  {t("searching")}
                </p>
              ) : findings === null ? null : (
                <FoundPages
                  findings={findings}
                  selected={selected}
                  onToggle={toggle}
                  platformLabels={platformLabels}
                />
              )}
              {error === null ? null : (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}
            </Modal.Body>

            <Modal.Footer>
              <Button variant="secondary" slot="close">
                {t("cancel")}
              </Button>
              <Button
                isDisabled={selected.length === 0}
                isPending={isSaving}
                onPress={save}
              >
                {t("save")}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
