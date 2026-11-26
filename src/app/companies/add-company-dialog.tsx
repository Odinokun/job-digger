"use client";

import {
  Button,
  FieldError,
  Input,
  Label,
  Modal,
  Spinner,
  TextField,
  useOverlayState,
} from "@heroui/react";
import { useTranslations } from "next-intl";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FocusEvent,
} from "react";

import { WithTooltip } from "@/app/components/icon-button";
import { useActionFailedToast } from "@/app/components/use-action-failed-toast";
import type {
  CompaniesTab,
  CompanyListItem,
} from "@/lib/companies/company-list";
import type { CareerPlatform } from "@/lib/companies/platform";
import type {
  AddCareerSourceFormState,
  AddCompanyFormState,
  FoundPage,
} from "./form-state";
import { suggestCompanyFields } from "@/lib/companies/suggest";
import {
  normalizeCompanyUrl,
  type UrlRefusalReason,
} from "@/lib/companies/url";

import {
  addCareerSourceAction,
  addCompanyAction,
  findPagesAction,
} from "./actions";
import { FoundPages } from "./found-pages";
import { ADD_COMPANY_INITIAL_STATE } from "./form-state";
import { URL_ERROR_KEYS } from "./url-errors";

/** An empty form: both the initial state and what it returns to after success. */
const EMPTY_FIELDS = { url: "", name: "", careerUrl: "" };

/** Fields the suggestion leaves alone if the user has already typed something there. */
const EMPTY_EDITS = { name: false, careerUrl: false };

/** No client-side refusals: both the initial state and the reset on edit. */
const EMPTY_REFUSALS = { url: null, careerUrl: null };

/**
 * The Add button and the add-company modal.
 *
 * Adding lives in a modal, not on a separate page
 * (src/server/discovery/README.md). The name and the main site are guessed from
 * the pasted address without a network request, and Find pages searches for
 * career sources on the server and shows the findings with checkboxes
 * (`found-pages.tsx`).
 *
 * A client component, because the modal needs its open state and the form needs
 * the Server Action result. The company list itself stays on the server.
 */
interface AddCompanyDialogProps {
  /** The tab currently shown: whether the company lands in this list depends on it. */
  tab: CompaniesTab;
  /**
   * The added row, or `null` if the company belongs to another tab.
   * The list inserts it into itself, so loaded batches stay.
   */
  onAdded: (added: CompanyListItem | null, firstCheck: string | null) => void;
  /**
   * The company that received the pasted address as one more career source.
   * Its row is already in the list, so it is replaced, not added.
   */
  onSourceAdded: (companyId: string, saved: CompanyListItem | null) => void;
  /** Platform names for the findings list - the same as on the company cards. */
  platformLabels: Record<CareerPlatform, string>;
}

export function AddCompanyDialog({
  tab,
  onAdded,
  onSourceAdded,
  platformLabels,
}: AddCompanyDialogProps) {
  const t = useTranslations("CompaniesPage.addCompany");
  const tUrlError = useTranslations("CompaniesPage.urlErrors");
  // The source label and the duplicate text are set in two modals, so their
  // texts live one level up, next to `urlErrors`.
  const tShared = useTranslations("CompaniesPage");
  const tCommon = useTranslations("Common");
  const showActionFailed = useActionFailedToast();
  const overlay = useOverlayState();
  const [state, submit, isPending] = useActionState(
    addCompanyAction,
    ADD_COMPANY_INITIAL_STATE,
  );

  // The fields are controlled because the suggestion from the address writes
  // into them: without state there is nothing to fill in.
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [editedByHand, setEditedByHand] = useState(EMPTY_EDITS);
  const [isSuggested, setSuggested] = useState(false);

  // The offer "add this address as a career page of the company found" is a
  // separate action, not another form submission: it adds no company, so it has
  // its own state.
  const [sourceState, setSourceState] =
    useState<AddCareerSourceFormState | null>(null);
  const [isAddingSource, startAddingSource] = useTransition();
  // The label for the address that becomes one more source of the company found:
  // it is needed there just as in the Edit modal - otherwise three filters of
  // one page cannot be told apart.
  const [sourceLabel, setSourceLabel] = useState("");
  // Whether the form was submitted since the window opened. `useActionState`
  // lives as long as the component, and the modal is only hidden - without this
  // flag the next opening would show last time's refusal at once
  // ("Already added as ..." before the user typed anything).
  const [isSubmitted, setSubmitted] = useState(false);
  const [, startSubmit] = useTransition();
  // Refusals visible before Save. The server repeats the same check - the
  // fields come from the client - but there is no point sending `ftp://` there
  // and back. Find pages findings: `null` means no search for this address yet.
  const [findings, setFindings] = useState<FoundPage[] | null>(null);
  const [selectedFound, setSelectedFound] = useState<string[]>([]);
  const [isFinding, startFinding] = useTransition();
  const [findError, setFindError] = useState<"address-required" | null>(null);
  const [refusals, setRefusals] = useState<{
    url: UrlRefusalReason | null;
    careerUrl: UrlRefusalReason | null;
  }>(EMPTY_REFUSALS);

  // Success closes the modal, not the button itself: until the company is
  // saved, the user has to see their data and the error message.
  // `close` is taken into its own variable because `useOverlayState` returns a
  // new object on every render (`close` itself is stable). With the whole
  // `overlay` in the dependencies the effect would re-run constantly and, when
  // the modal opened, see the success already handled: the window would close
  // at once and the button would look dead.
  const closeDialog = overlay.close;

  // Every result exactly once. The effect re-runs not only with a new state:
  // `onAdded` changes identity together with the translator after every
  // Server Action. A repeat would insert the row as it was at Save and
  // overwrite the result of the first check (task 5.09).
  const handledState = useRef<AddCompanyFormState | null>(null);

  useEffect(() => {
    if (state.status === "added" && handledState.current !== state) {
      handledState.current = state;
      onAdded(state.company, state.firstCheck);
      closeDialog();
    }
  }, [state, closeDialog, onAdded]);

  // An unexpected failure does not belong to a form field: the user has nothing
  // to fix, so a notification reports it, and the window stays open with the
  // data entered.
  useEffect(() => {
    if (state.status === "failed-unexpectedly") {
      showActionFailed();
    }
  }, [state, showActionFailed]);

  useEffect(() => {
    if (sourceState?.status === "added") {
      onSourceAdded(sourceState.companyId, sourceState.company);
      closeDialog();
    }
  }, [sourceState, closeDialog, onSourceAdded]);

  useEffect(() => {
    if (sourceState?.status === "failed-unexpectedly") {
      showActionFailed();
    }
  }, [sourceState, showActionFailed]);

  // The form is cleared on opening, not on success: the fields are controlled,
  // so otherwise the next opening would show the previous company. The reset
  // sits in the button, not in an effect - an effect with `setState` causes a
  // cascading render (`react-hooks/set-state-in-effect`).
  function openDialog() {
    setFields(EMPTY_FIELDS);
    setEditedByHand(EMPTY_EDITS);
    setSuggested(false);
    setSourceState(null);
    setSourceLabel("");
    setSubmitted(false);
    setRefusals(EMPTY_REFUSALS);
    setFindings(null);
    setSelectedFound([]);
    setFindError(null);
    overlay.open();
  }

  function changeField(field: keyof typeof EMPTY_FIELDS, value: string) {
    setFields((previous) => ({ ...previous, [field]: value }));

    // The refusal text was about the field's previous value.
    if (field !== "name") {
      setRefusals((previous) => ({ ...previous, [field]: null }));
    }

    if (field === "url") {
      // The findings were about the previous address.
      setFindings(null);
      setSelectedFound([]);
      setFindError(null);

      // The field was cleared - another address comes next, and the suggestion has to work again.
      if (value.trim() === "") {
        setSuggested(false);
      }

      return;
    }

    setEditedByHand((previous) => ({ ...previous, [field]: true }));
  }

  /**
   * The suggestion from the address - once per pasted address.
   *
   * It cannot repeat on every blur: a user who added a path to the domain
   * (`bosch.com` - `bosch.com/careers`) would see the suggestion cut the
   * address down to the domain again.
   */
  function suggestFromUrl(nextFocus: EventTarget | null) {
    if (isSuggested || fields.url.trim() === "") {
      return;
    }

    const suggestion = suggestCompanyFields(fields.url);

    // The suggestion does not parse a bad address - the fields stay as they
    // are, and the Server Action reports the error.
    if (
      suggestion.url === "" &&
      suggestion.name === "" &&
      suggestion.careerUrl === ""
    ) {
      return;
    }

    // The suggestion arrives when focus leaves the address field - that is, when
    // focus is already in the next field. If that is the name field, the user
    // clicked there to type the name themselves: a suggestion written at that
    // moment would be glued to their text ("AcmeAcme Corp", task 6.12). Selecting
    // the suggestion so that typing replaces it is not possible at that moment:
    // focus is not in the name field yet (checked).
    const isTypingName =
      nextFocus instanceof HTMLInputElement && nextFocus.name === "name";
    const suggestsName =
      !editedByHand.name && !isTypingName && suggestion.name !== "";
    const suggestsCareerUrl =
      !editedByHand.careerUrl && suggestion.careerUrl !== "";

    setSuggested(true);
    setFields((previous) => ({
      // An ATS address gives no main site, and the field is left empty on
      // purpose: the address moved to the career field, and the user types the
      // company site.
      url: suggestion.url,
      name: suggestsName ? suggestion.name : previous.name,
      careerUrl: suggestsCareerUrl ? suggestion.careerUrl : previous.careerUrl,
    }));
  }

  /**
   * Find pages: a server-side search for career sources by site and name.
   *
   * The name comes from the field, or, while it is still empty, from the
   * suggestion for the address: clicking the button takes focus off the address
   * field, and at that moment the suggestion has not reached state yet.
   */
  function findPages() {
    const name = fields.name.trim() || suggestCompanyFields(fields.url).name;
    const url = fields.url;

    setFindError(null);
    startFinding(async () => {
      const result = await findPagesAction(url, name);

      if (result.ok) {
        setFindings(result.findings);
        setSelectedFound([]);
        return;
      }

      if (result.problem === "company-url") {
        setRefusals((previous) => ({ ...previous, url: result.reason }));
      } else if (result.problem === "address-required") {
        setFindError("address-required");
      } else {
        showActionFailed();
      }
    });
  }

  function toggleFound(url: string, isSelected: boolean) {
    setSelectedFound((previous) =>
      isSelected
        ? [...previous, url]
        : previous.filter((selected) => selected !== url),
    );
  }

  /**
   * Saves the pasted address as one more source of the company found.
   *
   * The address comes from the career page field: that is where the suggestion
   * put it after recognising it is not the main site (`suggestCompanyFields`).
   */
  function addAsSource(companyId: string) {
    startAddingSource(async () => {
      setSourceState(
        await addCareerSourceAction(
          companyId,
          fields.careerUrl,
          sourceLabel,
          tab,
        ),
      );
    });
  }

  /**
   * Checks the address when focus leaves the field.
   *
   * An empty field is not an error: the company address is required, but Save
   * says so, not leaving a field where nothing was typed yet.
   */
  function checkAddress(field: "url" | "careerUrl") {
    const typed = fields[field].trim();

    if (typed === "") {
      setRefusals((previous) => ({ ...previous, [field]: null }));
      return;
    }

    const normalized = normalizeCompanyUrl(typed);

    setRefusals((previous) => ({
      ...previous,
      [field]: normalized.ok ? null : normalized.reason,
    }));
  }

  const failure =
    isSubmitted && state.status === "failed" ? state.result : null;
  const sameDomain = failure?.problem === "same-domain" ? failure : null;
  const sameName = failure?.problem === "same-name" ? failure : null;

  // A field error goes to `FieldError` together with `isInvalid`: in the
  // installed version the `validationErrors` prop lives on `Form`, not on the field.
  const nameError =
    failure?.problem === "name-required" ? t("errors.nameRequired") : null;

  // A client-side refusal is newer than the state of the last submission, so it comes first.
  const urlError = refusals.url
    ? tUrlError(URL_ERROR_KEYS[refusals.url])
    : failure?.problem === "company-url"
      ? tUrlError(URL_ERROR_KEYS[failure.reason])
      : failure?.problem === "already-added"
        ? t("errors.alreadyAdded", { name: failure.company.name })
        : null;

  // Find pages without a site and a name: there is nothing to search by. It is
  // about a pair of fields, so it stands apart, not in a `FieldError`.
  const addressError = findError !== null ? t("errors.addressRequired") : null;

  const sourceFailure =
    sourceState?.status === "failed" ? sourceState.result : null;

  const careerUrlError = refusals.careerUrl
    ? tUrlError(URL_ERROR_KEYS[refusals.careerUrl])
    : failure?.problem === "career-url"
      ? tUrlError(URL_ERROR_KEYS[failure.reason])
      : sourceFailure?.problem === "source-url"
        ? tUrlError(URL_ERROR_KEYS[sourceFailure.reason])
        : sourceFailure?.problem === "source-duplicate"
          ? tShared("sourceDuplicate")
          : failure?.problem === "source-taken"
            ? tShared("sourceTaken", { name: failure.company.name })
            : sourceFailure?.problem === "source-taken"
              ? tShared("sourceTaken", { name: sourceFailure.company.name })
              : null;

  /**
   * Companies that can take the pasted address instead of creating a new
   * card.
   *
   * Two cases: an exact match with the site of an existing company (task 2.16)
   * and a match by name (task 2.17) - one company publishes vacancies on several
   * platforms, and every next address should go into the existing card.
   *
   * The condition on the career page field is shared: if the user pasted only
   * the main site, there is nothing to add as a source.
   *
   * Only `id` and the name are needed - enough for the button and for the call.
   */
  const attachTargets: { id: string; name: string }[] =
    fields.careerUrl.trim() === ""
      ? []
      : failure?.problem === "already-added"
        ? [failure.company]
        : failure?.problem === "same-name"
          ? failure.companies
          : [];

  return (
    <>
      <Button onPress={openDialog}>{t("open")}</Button>

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
                after the action React calls `reset` on the form, React Aria sees
                that event and reports `onChange("")`, so even controlled fields
                lost their input - after an "already added" refusal the address
                vanished together with the offer to add it as a source. The call
                inside `startTransition` is required, otherwise `isPending` from
                `useActionState` does not update (React's warning "An async
                function with useActionState was called outside of a
                transition"). This takes no progressive enhancement away:
                JavaScript opens the modal anyway. */}
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
              {/* The server needs the tab to say whether the new company shows
                  in this list. */}
              <input type="hidden" name="tab" value={tab} />
              <Modal.Body className="flex flex-col gap-4">
                {/* The address comes first: the two fields below are filled from it. */}
                {/* The site is required (task company-site-required): an ATS link
                    fills in the career page and the name, and the user types
                    the company site. */}
                <TextField
                  autoFocus
                  fullWidth
                  isRequired
                  name="url"
                  value={fields.url}
                  onChange={(value) => changeField("url", value)}
                  onBlur={(event: FocusEvent) => {
                    suggestFromUrl(event.relatedTarget);
                    checkAddress("url");
                  }}
                  isInvalid={urlError !== null}
                >
                  <Label>{t("url")}</Label>
                  <Input placeholder={t("urlPlaceholder")} />
                  <FieldError>{urlError}</FieldError>
                  <span className="text-hint text-muted">{t("urlHint")}</span>
                </TextField>

                {/* The search runs on the server and reads other sites with
                    politeness pauses - that takes seconds, hence the spinner. */}
                <div className="flex flex-col items-start gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    isPending={isFinding}
                    onPress={findPages}
                  >
                    {({ isPending: isSearching }) => (
                      <>
                        {isSearching ? (
                          <Spinner color="current" size="sm" />
                        ) : null}
                        {t("findPages")}
                      </>
                    )}
                  </Button>
                  {findings === null ? null : (
                    <FoundPages
                      findings={findings}
                      selected={selectedFound}
                      onToggle={toggleFound}
                      platformLabels={platformLabels}
                    />
                  )}
                </div>

                <TextField
                  fullWidth
                  isRequired
                  name="name"
                  value={fields.name}
                  onChange={(value) => changeField("name", value)}
                  isInvalid={nameError !== null}
                >
                  <Label>{t("name")}</Label>
                  <Input />
                  <FieldError>{nameError}</FieldError>
                </TextField>

                <TextField
                  fullWidth
                  name="careerUrl"
                  value={fields.careerUrl}
                  onChange={(value) => changeField("careerUrl", value)}
                  onBlur={() => checkAddress("careerUrl")}
                  isInvalid={careerUrlError !== null}
                >
                  <Label>{t("careerUrl")}</Label>
                  <Input placeholder={t("careerUrlPlaceholder")} />
                  <FieldError>{careerUrlError}</FieldError>
                  <span className="text-hint text-muted">
                    {t("careerUrlHint")}
                  </span>
                </TextField>

                {sameName ? (
                  <div className="flex flex-col gap-1 text-sm">
                    <p>{t("sameNameWarning")}</p>
                    <ul className="list-inside list-disc text-muted">
                      {sameName.companies.map((company) => (
                        <li key={company.id}>
                          {company.name} - {company.url}
                        </li>
                      ))}
                    </ul>
                    <input type="hidden" name="confirmed" value="true" />
                  </div>
                ) : null}

                {sameDomain ? (
                  <div className="flex flex-col gap-1 text-sm">
                    <p>{t("sameDomainWarning")}</p>
                    <ul className="list-inside list-disc text-muted">
                      {sameDomain.companies.map((company) => (
                        <li key={company.id}>
                          {company.name} - {company.url}
                        </li>
                      ))}
                    </ul>
                    {/* The same flag as in addCompany: a repeated Save gets past
                        the warning, an exact duplicate does not. */}
                    <input type="hidden" name="confirmed" value="true" />
                  </div>
                ) : null}

                {attachTargets.length > 0 ? (
                  <div className="flex flex-col items-start gap-2 text-sm">
                    <p>
                      {attachTargets.length === 1
                        ? t("addAsSourceHint", { name: attachTargets[0].name })
                        : t("addAsSourceChoose")}
                    </p>

                    {/* One label for all the buttons: it describes this address,
                        not the company it goes to. It tells one company's
                        platforms apart in the list of sources. */}
                    <TextField
                      fullWidth
                      value={sourceLabel}
                      onChange={setSourceLabel}
                    >
                      <Label>{tShared("sourceLabel")}</Label>
                      <Input />
                    </TextField>

                    {/* One button per company found: there may be several with
                        the same name, and only the user knows which one is meant.

                        The buttons call a separate action, hence
                        `type="button"`: otherwise they would submit the form
                        again and hit the same warning. */}
                    <div className="flex flex-wrap gap-2">
                      {attachTargets.map((company) => (
                        <Button
                          key={company.id}
                          type="button"
                          variant="secondary"
                          isPending={isAddingSource}
                          onPress={() => addAsSource(company.id)}
                        >
                          {t("addAsSource", { name: company.name })}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* A refusal about the pair of fields: which of the two to fill
                    is the user's choice, so the text stands under both, not in
                    one `FieldError`. */}
                {addressError ? (
                  <p className="text-sm text-danger">{addressError}</p>
                ) : null}
              </Modal.Body>

              <Modal.Footer>
                <Button slot="close" variant="secondary" type="button">
                  {t("cancel")}
                </Button>
                {/* Save is disabled until there is a name and a site (UI audit,
                    B4): an empty Save never said what was missing. */}
                <Button
                  type="submit"
                  isPending={isPending}
                  isDisabled={
                    fields.name.trim() === "" || fields.url.trim() === ""
                  }
                >
                  {sameDomain ? t("addAnyway") : t("save")}
                </Button>
              </Modal.Footer>
            </form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
