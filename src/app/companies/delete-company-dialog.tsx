"use client";

import { TrashBin } from "@gravity-ui/icons";
import { AlertDialog, Button, useOverlayState } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useTransition } from "react";

import { IconButton, WithTooltip } from "@/app/components/icon-button";
import { useActionFailedToast } from "@/app/components/use-action-failed-toast";
import type { CompanyListItem } from "@/lib/companies/company-list";

import { deleteCompanyAction } from "./actions";
import { DELETE_COMPANY_INITIAL_STATE } from "./form-state";

interface DeleteCompanyDialogProps {
  company: CompanyListItem;
  /** The company is gone: the list removes its row. */
  onDeleted: (companyId: string) => void;
}

/**
 * The trash button on a company card and its confirmation dialog.
 *
 * The confirmation is required because there is no undo for a deletion: its
 * sources and vacancies go with the company, including those in Favorites.
 *
 * An `AlertDialog`, not a `Modal`: this window demands a decision, and HeroUI
 * gives it `role="alertdialog"` together with a status icon. The Add and Edit
 * modals are plain forms, so they use `Modal`.
 *
 * The dialog says what exactly will disappear: the company, the number of its
 * career pages and, if there are any, of its vacancies - including those in
 * Favorites. The numbers come from the company list (`company.vacancies`);
 * there is no separate request on opening.
 */
export function DeleteCompanyDialog({
  company,
  onDeleted,
}: DeleteCompanyDialogProps) {
  const t = useTranslations("CompaniesPage.deleteCompany");
  const tCommon = useTranslations("Common");
  const showActionFailed = useActionFailedToast();
  const overlay = useOverlayState();
  const [state, submit, isPending] = useActionState(
    deleteCompanyAction,
    DELETE_COMPANY_INITIAL_STATE,
  );
  const [, startSubmit] = useTransition();

  // The same as in the Edit modal: `close` is taken into its own variable
  // because `useOverlayState` returns a new object on every render.
  const closeDialog = overlay.close;

  useEffect(() => {
    // `not-found` is not an error here but the same result: the company is
    // already gone - it was deleted in another tab while the dialog was open. The
    // user wanted exactly that, so the row is removed the same way, with no
    // separate text.
    if (
      state.status === "deleted" ||
      (state.status === "failed" && state.result.problem === "not-found")
    ) {
      onDeleted(company.id);
      closeDialog();
    }
  }, [state, closeDialog, onDeleted, company.id]);

  useEffect(() => {
    if (state.status === "failed-unexpectedly") {
      showActionFailed();
    }
  }, [state, showActionFailed]);

  return (
    <>
      {/* An icon-only button: `IconButton` gives it its name - for screen
          readers and as a tooltip on hover. `Button` sets the icon size itself
          (HeroUI docs, Button - Icon Only). */}
      <IconButton
        size="sm"
        variant="tertiary"
        label={t("open")}
        onPress={overlay.open}
      >
        <TrashBin />
      </IconButton>

      <AlertDialog.Backdrop
        isOpen={overlay.isOpen}
        onOpenChange={overlay.setOpen}
      >
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-100">
            <WithTooltip label={tCommon("close")}>
              <AlertDialog.CloseTrigger aria-label={tCommon("close")} />
            </WithTooltip>
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>{t("title")}</AlertDialog.Heading>
            </AlertDialog.Header>

            {/* The form is submitted by hand, as in the other modals: after the
                action React calls `reset` on the form, and React Aria reports a
                change of the fields. There are no fields here, but the pattern
                stays shared.

                The confirm button has no `slot="close"`, although HeroUI's
                examples set it: the action's success should close the window,
                not the click, otherwise a failure would go unreported. */}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const fieldsToSend = new FormData(event.currentTarget);

                startSubmit(() => submit(fieldsToSend));
              }}
            >
              <input type="hidden" name="companyId" value={company.id} />

              <AlertDialog.Body>
                <p>
                  {t("warning", {
                    name: company.name,
                    count: company.sources.length,
                  })}
                </p>
                {company.vacancies.total === 0 ? null : (
                  <p>{t("vacancies", company.vacancies)}</p>
                )}
              </AlertDialog.Body>

              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary" type="button">
                  {t("cancel")}
                </Button>
                <Button variant="danger" type="submit" isPending={isPending}>
                  {t("confirm")}
                </Button>
              </AlertDialog.Footer>
            </form>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </>
  );
}
