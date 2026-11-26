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
  /** Збережений рядок або `null`, якщо компанія вкладці більше не належить. */
  onSaved: (companyId: string, saved: CompanyListItem | null) => void;
}

/**
 * Find pages для вже доданої компанії - на картці Not tracked (задача
 * 5.14). Той самий пошук і список знахідок, що в модалці
 * Add company, але за сайтом і назвою самої компанії, тож пошук стартує одразу
 * на відкритті.
 *
 * Після Save компанія з джерелом, що читається, переїжджає в Tracked і зникає
 * з цього списку, тому перша перевірка йде без кнопки Check now - так само, як
 * після Add company з вкладки Not tracked (5.09).
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

  /** Відкриття скидає минулий пошук і запускає новий. */
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
      // Між пошуком і Save сторінку могли додати іншій компанії чи цій самій:
      // відмови ті самі, що в модалках Add і Edit.
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
              {/* Пошук читає чужі сайти з паузами ввічливості - це секунди. */}
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
