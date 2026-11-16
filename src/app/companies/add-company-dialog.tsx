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
import { useActionState, useEffect } from "react";

import type { UrlRefusalReason } from "@/lib/companies/url";

import { ADD_COMPANY_INITIAL_STATE, addCompanyAction } from "./actions";

/** Ключ перекладу для причини, через яку адресу не прийняли. */
const URL_ERROR_KEYS: Record<UrlRefusalReason, string> = {
  empty: "errors.urlEmpty",
  "not-a-url": "errors.urlNotAnAddress",
  "unsupported-scheme": "errors.urlUnsupportedScheme",
};

/**
 * Кнопка Add і модальне вікно додавання компанії.
 *
 * Додавання живе саме в модалці, а не на окремій сторінці - це вимога плану
 * (docs/discovery-and-parsing.md, розділ 5). Автоматичного пошуку сторінок тут
 * ще немає: обидві адреси вводяться руками, пошук приходить в етапі 5.
 *
 * Компонент клієнтський, бо модалці потрібен стан відкриття, а формі -
 * результат Server Action. Сам список компаній лишається серверним.
 */
export function AddCompanyDialog() {
  const t = useTranslations("CompaniesPage.addCompany");
  const overlay = useOverlayState();
  const [state, submit, isPending] = useActionState(
    addCompanyAction,
    ADD_COMPANY_INITIAL_STATE,
  );

  // Модалку закриває успіх, а не сама кнопка: доки компанія не збереглася,
  // користувач має бачити свої дані й повідомлення про помилку.
  useEffect(() => {
    if (state.status === "added") {
      overlay.close();
    }
  }, [state, overlay]);

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
      <Button onPress={overlay.open}>{t("open")}</Button>

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
                <TextField
                  autoFocus
                  fullWidth
                  isRequired
                  name="name"
                  isInvalid={nameError !== null}
                >
                  <Label>{t("name")}</Label>
                  <Input placeholder={t("namePlaceholder")} />
                  <FieldError>{nameError}</FieldError>
                </TextField>

                <TextField
                  fullWidth
                  isRequired
                  name="url"
                  isInvalid={urlError !== null}
                >
                  <Label>{t("url")}</Label>
                  <Input placeholder={t("urlPlaceholder")} />
                  <FieldError>{urlError}</FieldError>
                </TextField>

                <TextField
                  fullWidth
                  name="careerUrl"
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
