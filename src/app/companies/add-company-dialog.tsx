"use client";

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
import { useActionState, useEffect, useState } from "react";

import { useActionFailedToast } from "@/app/components/use-action-failed-toast";
import { suggestCompanyFields } from "@/lib/companies/suggest";
import type { UrlRefusalReason } from "@/lib/companies/url";

import { ADD_COMPANY_INITIAL_STATE, addCompanyAction } from "./actions";

/** Ключ перекладу для причини, через яку адресу не прийняли. */
const URL_ERROR_KEYS: Record<UrlRefusalReason, string> = {
  empty: "errors.urlEmpty",
  "not-a-url": "errors.urlNotAnAddress",
  "unsupported-scheme": "errors.urlUnsupportedScheme",
};

/** Порожня форма: і початковий стан, і те, до чого вона вертається після успіху. */
const EMPTY_FIELDS = { url: "", name: "", careerUrl: "" };

/** Поля, у які підказка не лізе, якщо користувач уже написав там своє. */
const EMPTY_EDITS = { name: false, careerUrl: false };

/**
 * Кнопка Add і модальне вікно додавання компанії.
 *
 * Додавання живе саме в модалці, а не на окремій сторінці - це вимога плану
 * (docs/discovery-and-parsing.md, розділ 5). Справжнього пошуку сторінок тут ще
 * немає - він приходить в етапі 5; назва й головний сайт лише вгадуються з
 * вставленої адреси, без жодного запиту в мережу.
 *
 * Компонент клієнтський, бо модалці потрібен стан відкриття, а формі -
 * результат Server Action. Сам список компаній лишається серверним.
 */
export function AddCompanyDialog() {
  const t = useTranslations("CompaniesPage.addCompany");
  const showActionFailed = useActionFailedToast();
  const overlay = useOverlayState();
  const [state, submit, isPending] = useActionState(
    addCompanyAction,
    ADD_COMPANY_INITIAL_STATE,
  );

  // Поля контрольовані, бо підказка з адреси пише в них: без стану тут нічого
  // підставити не можна.
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [editedByHand, setEditedByHand] = useState(EMPTY_EDITS);
  const [isSuggested, setSuggested] = useState(false);

  // Модалку закриває успіх, а не сама кнопка: доки компанія не збереглася,
  // користувач має бачити свої дані й повідомлення про помилку.
  useEffect(() => {
    if (state.status === "added") {
      overlay.close();
    }
  }, [state, overlay]);

  // Неочікуваний збій полю форми не належить: виправляти користувачеві нічого,
  // тому про нього повідомляє сповіщення, а вікно лишається відкритим зі
  // введеними даними.
  useEffect(() => {
    if (state.status === "failed-unexpectedly") {
      showActionFailed();
    }
  }, [state, showActionFailed]);

  // Форма чиститься на відкритті, а не на успіху: поля контрольовані, тому
  // інакше наступне відкриття показало б минулу компанію. Скидання стоїть у
  // кнопці, а не в ефекті - ефект із `setState` дає каскадний рендер
  // (`react-hooks/set-state-in-effect`).
  function openDialog() {
    setFields(EMPTY_FIELDS);
    setEditedByHand(EMPTY_EDITS);
    setSuggested(false);
    overlay.open();
  }

  function changeField(field: keyof typeof EMPTY_FIELDS, value: string) {
    setFields((previous) => ({ ...previous, [field]: value }));

    if (field === "url") {
      // Поле очистили - далі буде інша адреса, і підказка має спрацювати знову.
      if (value.trim() === "") {
        setSuggested(false);
      }

      return;
    }

    setEditedByHand((previous) => ({ ...previous, [field]: true }));
  }

  /**
   * Підказка з адреси - один раз на вставлену адресу.
   *
   * Повторювати її на кожному виході з поля не можна: користувач, який дописав
   * до домену шлях (`bosch.com` - `bosch.com/careers`), побачив би, що підказка
   * знову обрізала адресу до домену.
   */
  function suggestFromUrl() {
    if (isSuggested || fields.url.trim() === "") {
      return;
    }

    const suggestion = suggestCompanyFields(fields.url);

    // Криву адресу підказка не розбирає - тоді поля лишаються як є, а про
    // помилку скаже Server Action.
    if (
      suggestion.url === "" &&
      suggestion.name === "" &&
      suggestion.careerUrl === ""
    ) {
      return;
    }

    setSuggested(true);
    setFields((previous) => ({
      // Адреса ATS головного сайту не дає, і поле стає порожнім свідомо: сама
      // адреса переїхала в карʼєрне поле, а сайт компанії вписує користувач.
      url: suggestion.url,
      name:
        editedByHand.name || suggestion.name === ""
          ? previous.name
          : suggestion.name,
      careerUrl:
        editedByHand.careerUrl || suggestion.careerUrl === ""
          ? previous.careerUrl
          : suggestion.careerUrl,
    }));
  }

  const failure = state.status === "failed" ? state.result : null;
  const sameDomain = failure?.problem === "same-domain" ? failure : null;

  // Помилка поля йде в `FieldError` разом з `isInvalid`: проп
  // `validationErrors` у встановленій версії живе на `Form`, а не на полі.
  const nameError =
    failure?.problem === "name-required" ? t("errors.nameRequired") : null;

  const urlError =
    failure?.problem === "company-url"
      ? t(URL_ERROR_KEYS[failure.reason])
      : failure?.problem === "already-added"
        ? t("errors.alreadyAdded", { name: failure.company.name })
        : null;

  const careerUrlError =
    failure?.problem === "career-url"
      ? t(URL_ERROR_KEYS[failure.reason])
      : null;

  return (
    <>
      <Button onPress={openDialog}>{t("open")}</Button>

      <Modal.Backdrop isOpen={overlay.isOpen} onOpenChange={overlay.setOpen}>
        <Modal.Container>
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{t("title")}</Modal.Heading>
            </Modal.Header>

            {/* Звичайна форма з action: так поля надсилаються і без JS, і
                Server Action сам перевіряє походження запиту. */}
            <form action={submit}>
              <Modal.Body className="flex flex-col gap-4">
                {/* Адреса стоїть першою: з неї заповнюються два поля нижче. */}
                <TextField
                  autoFocus
                  fullWidth
                  isRequired
                  name="url"
                  value={fields.url}
                  onChange={(value) => changeField("url", value)}
                  onBlur={suggestFromUrl}
                  isInvalid={urlError !== null}
                >
                  <Label>{t("url")}</Label>
                  <Input placeholder={t("urlPlaceholder")} />
                  <FieldError>{urlError}</FieldError>
                  <span className="text-sm text-muted">{t("urlHint")}</span>
                </TextField>

                <TextField
                  fullWidth
                  isRequired
                  name="name"
                  value={fields.name}
                  onChange={(value) => changeField("name", value)}
                  isInvalid={nameError !== null}
                >
                  <Label>{t("name")}</Label>
                  <Input placeholder={t("namePlaceholder")} />
                  <FieldError>{nameError}</FieldError>
                </TextField>

                <TextField
                  fullWidth
                  name="careerUrl"
                  value={fields.careerUrl}
                  onChange={(value) => changeField("careerUrl", value)}
                  isInvalid={careerUrlError !== null}
                >
                  <Label>{t("careerUrl")}</Label>
                  <Input placeholder={t("careerUrlPlaceholder")} />
                  <FieldError>{careerUrlError}</FieldError>
                  <span className="text-sm text-muted">
                    {t("careerUrlHint")}
                  </span>
                </TextField>

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
                    {/* Той самий прапорець, що й у addCompany: повторний Save
                        проходить попередження, точний дублікат - ні. */}
                    <input
                      type="hidden"
                      name="sameDomainConfirmed"
                      value="true"
                    />
                  </div>
                ) : null}
              </Modal.Body>

              <Modal.Footer>
                <Button slot="close" variant="secondary" type="button">
                  {t("cancel")}
                </Button>
                <Button type="submit" isPending={isPending}>
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
