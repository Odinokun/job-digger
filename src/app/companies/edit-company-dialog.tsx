"use client";

import { ArrowRotateLeft, PencilToSquare, TrashBin } from "@gravity-ui/icons";
import {
  Button,
  FieldError,
  Input,
  Label,
  Modal,
  TextField,
  useOverlayState,
} from "@heroui/react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState, useTransition } from "react";

import { IconButton, WithTooltip } from "@/app/components/icon-button";
import { useActionFailedToast } from "@/app/components/use-action-failed-toast";
import { prepareCareerSource } from "@/lib/companies/career-source";
import { knownAtsName } from "@/lib/companies/known-ats";
import type {
  CompaniesTab,
  CompanyListItem,
  CompanySource,
} from "@/lib/companies/company-list";
import type { UrlRefusalReason } from "@/lib/companies/url";

import { updateCompanyAction } from "./actions";
import { EDIT_COMPANY_INITIAL_STATE } from "./form-state";
import { URL_ERROR_KEYS } from "./url-errors";

interface EditCompanyDialogProps {
  company: CompanyListItem;
  /** The tab the company is shown in: whether it stays in the list depends on it. */
  tab: CompaniesTab;
  platformLabels: Record<CompanySource["platform"], string>;
  /**
   * The saved row, or `null` if the company no longer belongs to the tab.
   * The list replaces exactly that row, so loaded batches stay.
   */
  onSaved: (companyId: string, saved: CompanyListItem | null) => void;
}

/** An empty add block: both the initial state and what it returns to. */
const EMPTY_NEW_SOURCE = { url: "", label: "" };

/**
 * The Edit modal: the company name and site, career source labels, removing
 * sources and adding a new one.
 *
 * The site is editable since task company-site-required: it is required, and a
 * mistake in it could not be fixed otherwise. The addresses of existing sources
 * are not: fixing a source address was never planned (task 2.05). A new source
 * is typed by hand because automatic search only came with task 5.07, while a
 * second source was needed already: on mozilla.org vacancies are filtered by
 * country, and every filter is a separate page (task 2.16).
 *
 * Removing a source only marks it, and Save applies it: there is no separate
 * confirmation dialog for one source (src/app/README.md, "Screens"), so undoing
 * has to stay possible until saving.
 */
export function EditCompanyDialog({
  company,
  tab,
  platformLabels,
  onSaved,
}: EditCompanyDialogProps) {
  const t = useTranslations("CompaniesPage.editCompany");
  const tUrlError = useTranslations("CompaniesPage.urlErrors");
  // The source label and the duplicate text are set in two modals, so their
  // texts live one level up, next to `urlErrors`.
  const tShared = useTranslations("CompaniesPage");
  const tCommon = useTranslations("Common");
  const showActionFailed = useActionFailedToast();
  const overlay = useOverlayState();
  const [state, submit, isPending] = useActionState(
    updateCompanyAction,
    EDIT_COMPANY_INITIAL_STATE,
  );

  const [removed, setRemoved] = useState<string[]>([]);
  // Name and site are controlled: Save is disabled while either is empty (UI
  // audit, B4), and React resets an uncontrolled form after submission.
  const [name, setName] = useState(company.name);
  const [siteUrl, setSiteUrl] = useState(company.url);
  // The label fields and the add block are controlled: React resets an
  // uncontrolled form after submission, and on a refusal the user would lose the input.
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [newSource, setNewSource] = useState(EMPTY_NEW_SOURCE);
  // A refusal visible before Save: the server does the same check, but there is
  // no reason to wait for submission to see `ftp://`.
  const [newSourceRefusal, setNewSourceRefusal] = useState<
    | { problem: "source-url"; reason: UrlRefusalReason }
    | { problem: "source-duplicate" }
    | null
  >(null);
  const [, startSubmit] = useTransition();
  // Whether the form was submitted since the window opened: `useActionState`
  // survives closing the modal, and without the flag the next opening would show
  // last time's refusal. The same in the Add company modal.
  const [isSubmitted, setSubmitted] = useState(false);

  // Success closes the modal, not the button: until the changes are saved, the
  // user has to see their edits and the error message.
  // `close` is taken into its own variable because `useOverlayState` returns a
  // new object on every render (`close` itself is stable). With the whole
  // `overlay` in the dependencies the effect would re-run constantly and, when
  // the modal opened, see the success already handled: the window would close
  // at once and the button would look dead.
  const closeDialog = overlay.close;

  useEffect(() => {
    if (state.status === "saved") {
      onSaved(company.id, state.company);
      closeDialog();
    }
  }, [state, closeDialog, onSaved, company.id]);

  useEffect(() => {
    if (state.status === "failed-unexpectedly") {
      showActionFailed();
    }
  }, [state, showActionFailed]);

  /**
   * Opening resets the marks and the fields: the window is controlled, so
   * otherwise the next opening would show the previous choice. The reset sits in
   * the button, not in an effect - `setState` in an effect causes a cascading
   * render (`react-hooks/set-state-in-effect`).
   */
  function openDialog() {
    setName(company.name);
    setSiteUrl(company.url);
    setRemoved([]);
    setLabels(
      Object.fromEntries(
        company.sources.map((source) => [source.id, source.label ?? ""]),
      ),
    );
    setNewSource(EMPTY_NEW_SOURCE);
    setNewSourceRefusal(null);
    setSubmitted(false);
    overlay.open();
  }

  function toggleRemoved(sourceId: string) {
    setRemoved((current) =>
      current.includes(sourceId)
        ? current.filter((id) => id !== sourceId)
        : [...current, sourceId],
    );
  }

  /**
   * Checks the typed address when focus leaves the field - with the same pure
   * function the server uses later (`prepareCareerSource` in `src/lib`).
   *
   * This does not replace the server check: the fields come from the client, and
   * the sources may change between the check and the insert. But a bad address
   * and a duplicate show up at once, not only after Save.
   */
  function checkNewSource() {
    const typed = newSource.url.trim();

    // An empty field means "no source added", not an error.
    if (typed === "") {
      setNewSourceRefusal(null);
      return;
    }

    const prepared = prepareCareerSource({
      url: typed,
      // Sources marked for removal do not count: after Save they are gone, so the
      // same address does not become a duplicate.
      existingUrls: company.sources
        .filter((source) => !removed.includes(source.id))
        .map((source) => source.url),
    });

    setNewSourceRefusal(
      prepared.ok
        ? null
        : prepared.problem === "url"
          ? { problem: "source-url", reason: prepared.reason }
          : { problem: "source-duplicate" },
    );
  }

  function changeLabel(sourceId: string, value: string) {
    setLabels((current) => ({ ...current, [sourceId]: value }));
  }

  const failure =
    isSubmitted && state.status === "failed" ? state.result : null;
  const nameError =
    failure?.problem === "name-required"
      ? t("errors.nameRequired")
      : failure?.problem === "not-found"
        ? t("errors.notFound")
        : null;

  const siteError =
    failure?.problem === "company-url"
      ? tUrlError(URL_ERROR_KEYS[failure.reason])
      : failure?.problem === "already-added"
        ? t("errors.siteTaken", { name: failure.company.name })
        : null;

  // A client-side refusal wins: it is newer than the state of the last submission.
  const sourceRefusal =
    newSourceRefusal ??
    (failure?.problem === "source-url" ||
    failure?.problem === "source-duplicate"
      ? failure
      : null);

  const newSourceError =
    sourceRefusal?.problem === "source-url"
      ? tUrlError(URL_ERROR_KEYS[sourceRefusal.reason])
      : sourceRefusal?.problem === "source-duplicate"
        ? tShared("sourceDuplicate")
        : // Another company's source: it is not visible in the list above, so the
          // refusal names who has it (task 2.17).
          failure?.problem === "source-taken"
          ? tShared("sourceTaken", { name: failure.company.name })
          : null;

  return (
    <>
      {/* Icon only, like the trash button next to it: the "Edit" text on the
          card added nothing. The tooltip gives the action its name. */}
      <IconButton
        size="sm"
        variant="secondary"
        label={t("open")}
        onPress={openDialog}
      >
        <PencilToSquare />
      </IconButton>

      <Modal.Backdrop isOpen={overlay.isOpen} onOpenChange={overlay.setOpen}>
        {/* Long content scrolls inside the window: without this
                  `modal__dialog` clips it (`overflow-clip`), and for a company
                  with three sources the add block and the buttons ended up
                  past the edge of the window, out of reach. */}
        <Modal.Container scroll="inside">
          <Modal.Dialog>
            <WithTooltip label={tCommon("close")}>
              <Modal.CloseTrigger aria-label={tCommon("close")} />
            </WithTooltip>
            <Modal.Header>
              <Modal.Heading>{t("title")}</Modal.Heading>
            </Modal.Header>

            {/* The form is submitted by hand, not through `action={submit}`:
                after the action React calls `reset` on the form, and React Aria
                reports `onChange("")`, so the input vanished even from
                controlled fields. Details in the Add company modal. */}
            {/* The form sits between `Modal.Dialog` and `Modal.Body`, so it has
                to be a flex column itself: otherwise the height limit never
                reaches the body, and scrolling inside the window does not
                work - the buttons end up below the bottom edge. */}
            <form
              className="flex min-h-0 flex-1 flex-col gap-6"
              onSubmit={(event) => {
                event.preventDefault();
                const fieldsToSend = new FormData(event.currentTarget);

                setSubmitted(true);
                startSubmit(() => submit(fieldsToSend));
              }}
            >
              <input type="hidden" name="companyId" value={company.id} />
              {/* The server needs the tab to say whether the company stays in
                  this list after saving. */}
              <input type="hidden" name="tab" value={tab} />

              <Modal.Body className="flex flex-col gap-4">
                <TextField
                  autoFocus
                  fullWidth
                  isRequired
                  name="name"
                  value={name}
                  onChange={setName}
                  isInvalid={nameError !== null}
                >
                  <Label>{t("name")}</Label>
                  <Input />
                  <FieldError>{nameError}</FieldError>
                </TextField>

                {/* The site is required and editable (task
                    company-site-required): otherwise a mistake in it could only
                    be fixed by deleting the company and adding it again. */}
                <TextField
                  fullWidth
                  isRequired
                  name="url"
                  value={siteUrl}
                  onChange={setSiteUrl}
                  isInvalid={siteError !== null}
                >
                  <Label>{t("url")}</Label>
                  <Input />
                  <FieldError>{siteError}</FieldError>
                </TextField>

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-semibold">{t("sources")}</span>

                  {company.sources.length === 0 ? (
                    <p className="text-sm text-muted">{t("noSources")}</p>
                  ) : (
                    <ul className="flex flex-col gap-6">
                      {company.sources.map((source) => {
                        const isRemoved = removed.includes(source.id);

                        return (
                          <li key={source.id} className="flex flex-col gap-2">
                            {/* The platform and the full address on the left,
                                the trash button on the right - always in the
                                same place, however long the address (UI audit,
                                A5). Here the address is full and wraps: on the
                                card it is truncated, and Edit is the only place
                                where it is visible in full. */}
                            <div className="flex items-start justify-between gap-3">
                              <div
                                className={
                                  isRemoved
                                    ? "min-w-0 text-sm text-muted line-through"
                                    : "min-w-0 text-sm"
                                }
                              >
                                <p className="font-medium">
                                  {knownAtsName(source.url) ??
                                    platformLabels[source.platform]}
                                </p>
                                <p className="break-all text-muted">
                                  {source.url}
                                </p>
                              </div>

                              {/* Removing is a dangerous action, so the trash
                                  button is red. A marked source can be restored
                                  with the same button - it then shows a "back"
                                  arrow. `--button-fg` is overridden through the
                                  variable: `text-danger` alone would lose to
                                  `color: var(--button-fg)` from the base class. */}
                              <IconButton
                                size="sm"
                                variant="tertiary"
                                label={isRemoved ? t("keep") : t("remove")}
                                className={
                                  isRemoved
                                    ? ""
                                    : "[--button-fg:var(--color-danger)]"
                                }
                                type="button"
                                onPress={() => toggleRemoved(source.id)}
                              >
                                {isRemoved ? <ArrowRotateLeft /> : <TrashBin />}
                              </IconButton>
                            </div>

                            {/* The label is how the user tells sources of one
                                site apart: three mozilla.org filters look the
                                same otherwise. A visible field label, not a
                                placeholder (audit A4, A5). The label of a row
                                marked for removal is not sent anywhere: a
                                disabled field does not get into FormData. */}
                            <TextField
                              fullWidth
                              name={`sourceLabel.${source.id}`}
                              value={labels[source.id] ?? ""}
                              onChange={(value) =>
                                changeLabel(source.id, value)
                              }
                              isDisabled={isRemoved}
                            >
                              <Label>{tShared("sourceLabel")}</Label>
                              <Input />
                            </TextField>

                            {/* A marked source travels in the form as a field:
                                the Server Action reads all `removeSourceIds`
                                together. */}
                            {isRemoved ? (
                              <input
                                type="hidden"
                                name="removeSourceIds"
                                value={source.id}
                              />
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {/* A warning instead of a confirmation dialog: a company
                      without sources moves to Not tracked. */}
                  {removed.length > 0 &&
                  removed.length === company.sources.length &&
                  newSource.url.trim() === "" ? (
                    <p className="text-sm">{t("lastSourceWarning")}</p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2 border-t pt-4">
                  <span className="text-sm font-semibold">
                    {t("addSource")}
                  </span>

                  <TextField
                    fullWidth
                    name="addSourceUrl"
                    value={newSource.url}
                    onChange={(url) => {
                      // Editing clears the refusal: its text was about the
                      // previous value.
                      setNewSourceRefusal(null);
                      setNewSource((current) => ({ ...current, url }));
                    }}
                    onBlur={checkNewSource}
                    isInvalid={newSourceError !== null}
                  >
                    <Label>{t("addSourceUrl")}</Label>
                    <Input placeholder={t("addSourceUrlPlaceholder")} />
                    <FieldError>{newSourceError}</FieldError>
                    <span className="text-hint text-muted">
                      {t("addSourceHint")}
                    </span>
                  </TextField>

                  <TextField
                    fullWidth
                    name="addSourceLabel"
                    value={newSource.label}
                    onChange={(label) =>
                      setNewSource((current) => ({ ...current, label }))
                    }
                  >
                    <Label>{tShared("sourceLabel")}</Label>
                    <Input />
                  </TextField>
                </div>
              </Modal.Body>

              <Modal.Footer>
                <Button slot="close" variant="secondary" type="button">
                  {t("cancel")}
                </Button>
                <Button
                  type="submit"
                  isPending={isPending}
                  isDisabled={name.trim() === "" || siteUrl.trim() === ""}
                >
                  {t("save")}
                </Button>
              </Modal.Footer>
            </form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
