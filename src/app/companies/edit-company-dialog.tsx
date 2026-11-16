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
import type {
  CompaniesTab,
  CompanyListItem,
  CompanySource,
} from "@/lib/companies/company-list";

import { updateCompanyAction } from "./actions";
import { EDIT_COMPANY_INITIAL_STATE } from "./form-state";
import { URL_ERROR_KEYS } from "./url-errors";

interface EditCompanyDialogProps {
  company: CompanyListItem;
  /** Вкладка, у якій зараз показана компанія: від неї залежить, чи лишиться вона в списку. */
  tab: CompaniesTab;
  platformLabels: Record<CompanySource["platform"], string>;
  /**
   * Збережений рядок або `null`, якщо компанія вкладці більше не належить.
   * Список замінює в себе саме його, тому дозавантажені порції лишаються.
   */
  onSaved: (companyId: string, saved: CompanyListItem | null) => void;
}

/** Порожній блок додавання: і початковий стан, і те, до чого він вертається. */
const EMPTY_NEW_SOURCE = { url: "", label: "" };

/**
 * Модалка Edit: назва компанії, підписи карʼєрних джерел, їх видалення й
 * додавання нового.
 *
 * Головний сайт компанії тут не редагується, як і адреси наявних джерел:
 * виправлення адреси в плані немає, а окремої сторінки деталей джерела - теж
 * (картка 2.05). Нове джерело вводиться руками, бо автоматичний пошук приходить
 * лише із задачею 5.07, а друге джерело потрібне вже зараз: на mozilla.org
 * вакансії фільтруються за країною, і кожен фільтр - окрема сторінка
 * (картка 2.16).
 *
 * Видалення джерела лише позначає його, а застосовує Save: рішення 6 у
 * docs/decisions.md - окремого діалогу підтвердження для одного джерела немає,
 * тому скасування має лишатися можливим до збереження.
 */
export function EditCompanyDialog({
  company,
  tab,
  platformLabels,
  onSaved,
}: EditCompanyDialogProps) {
  const t = useTranslations("CompaniesPage.editCompany");
  const tUrlError = useTranslations("CompaniesPage.urlErrors");
  // Текст про дублікат джерела спільний із модалкою Add company, тому лежить
  // рівнем вище, поряд із `urlErrors`.
  const tSourceDuplicate = useTranslations("CompaniesPage");
  const showActionFailed = useActionFailedToast();
  const overlay = useOverlayState();
  const [state, submit, isPending] = useActionState(
    updateCompanyAction,
    EDIT_COMPANY_INITIAL_STATE,
  );

  const [removed, setRemoved] = useState<string[]>([]);
  // Поля підписів і блок додавання контрольовані: React скидає неконтрольовану
  // форму після надсилання, і при відмові користувач втратив би введене.
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [newSource, setNewSource] = useState(EMPTY_NEW_SOURCE);

  // Модалку закриває успіх, а не кнопка: доки зміни не збереглися, користувач
  // має бачити свої правки й повідомлення про помилку.
  // Закриття взяте окремою змінною, бо `useOverlayState` повертає новий обʼєкт
  // на кожен рендер (сама `close` стабільна). Із цілим `overlay` у залежностях
  // ефект перезапускався б постійно й на відкритті модалки одразу бачив би вже
  // відпрацьований успіх: вікно закривалося б миттєво, а кнопка виглядала б
  // мертвою.
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
   * Відкриття скидає позначки й поля: вікно контрольоване, тому без цього
   * наступне відкриття показало б минулий вибір. Скидання в кнопці, а не в
   * ефекті - `setState` в ефекті дає каскадний рендер
   * (`react-hooks/set-state-in-effect`).
   */
  function openDialog() {
    setRemoved([]);
    setLabels(
      Object.fromEntries(
        company.sources.map((source) => [source.id, source.label ?? ""]),
      ),
    );
    setNewSource(EMPTY_NEW_SOURCE);
    overlay.open();
  }

  function toggleRemoved(sourceId: string) {
    setRemoved((current) =>
      current.includes(sourceId)
        ? current.filter((id) => id !== sourceId)
        : [...current, sourceId],
    );
  }

  function changeLabel(sourceId: string, value: string) {
    setLabels((current) => ({ ...current, [sourceId]: value }));
  }

  const failure = state.status === "failed" ? state.result : null;
  const nameError =
    failure?.problem === "name-required"
      ? t("errors.nameRequired")
      : failure?.problem === "not-found"
        ? t("errors.notFound")
        : null;

  const newSourceError =
    failure?.problem === "source-url"
      ? tUrlError(URL_ERROR_KEYS[failure.reason])
      : failure?.problem === "source-duplicate"
        ? tSourceDuplicate("sourceDuplicate")
        : null;

  return (
    <>
      <Button size="sm" variant="secondary" onPress={openDialog}>
        {t("open")}
      </Button>

      <Modal.Backdrop isOpen={overlay.isOpen} onOpenChange={overlay.setOpen}>
        <Modal.Container>
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{t("title")}</Modal.Heading>
            </Modal.Header>

            <form action={submit}>
              <input type="hidden" name="companyId" value={company.id} />
              {/* Вкладка потрібна серверу, щоб сказати, чи лишається
                  компанія в цьому списку після збереження. */}
              <input type="hidden" name="tab" value={tab} />

              <Modal.Body className="flex flex-col gap-4">
                <TextField
                  autoFocus
                  fullWidth
                  isRequired
                  name="name"
                  defaultValue={company.name}
                  isInvalid={nameError !== null}
                >
                  <Label>{t("name")}</Label>
                  <Input />
                  <FieldError>{nameError}</FieldError>
                </TextField>

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">{t("sources")}</span>

                  {company.sources.length === 0 ? (
                    <p className="text-sm text-muted">{t("noSources")}</p>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {company.sources.map((source) => {
                        const isRemoved = removed.includes(source.id);

                        return (
                          <li key={source.id} className="flex flex-col gap-1">
                            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                              <span
                                className={
                                  isRemoved ? "text-muted line-through" : ""
                                }
                              >
                                <span className="font-medium">
                                  {platformLabels[source.platform]}
                                </span>{" "}
                                <span className="text-muted">{source.url}</span>
                              </span>

                              <Button
                                size="sm"
                                variant="ghost"
                                type="button"
                                onPress={() => toggleRemoved(source.id)}
                              >
                                {isRemoved ? t("keep") : t("remove")}
                              </Button>
                            </div>

                            {/* Підпис - те, чим користувач розрізняє джерела
                                одного сайту: три фільтри mozilla.org інакше
                                виглядають однаково. Підпис рядка, що йде на
                                видалення, нікуди не надсилається: вимкнене
                                поле у FormData не потрапляє. */}
                            <TextField
                              fullWidth
                              name={`sourceLabel.${source.id}`}
                              aria-label={t("sourceLabel")}
                              value={labels[source.id] ?? ""}
                              onChange={(value) =>
                                changeLabel(source.id, value)
                              }
                              isDisabled={isRemoved}
                            >
                              <Input
                                placeholder={t("sourceLabelPlaceholder")}
                              />
                            </TextField>

                            {/* Позначене джерело їде у формі як поле: Server
                                Action читає всі `removeSourceIds` разом. */}
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

                  {/* Попередження замість діалогу підтвердження: компанія без
                      джерел переїжджає в Not tracked (docs/ui.md, розділ 4.3). */}
                  {removed.length > 0 &&
                  removed.length === company.sources.length &&
                  newSource.url.trim() === "" ? (
                    <p className="text-sm">{t("lastSourceWarning")}</p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2 border-t pt-4">
                  <span className="text-sm font-medium">{t("addSource")}</span>

                  <TextField
                    fullWidth
                    name="addSourceUrl"
                    value={newSource.url}
                    onChange={(url) =>
                      setNewSource((current) => ({ ...current, url }))
                    }
                    isInvalid={newSourceError !== null}
                  >
                    <Label>{t("addSourceUrl")}</Label>
                    <Input placeholder={t("addSourceUrlPlaceholder")} />
                    <FieldError>{newSourceError}</FieldError>
                    <span className="text-sm text-muted">
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
                    <Label>{t("sourceLabel")}</Label>
                    <Input placeholder={t("sourceLabelPlaceholder")} />
                  </TextField>
                </div>
              </Modal.Body>

              <Modal.Footer>
                <Button slot="close" variant="secondary" type="button">
                  {t("cancel")}
                </Button>
                <Button type="submit" isPending={isPending}>
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
