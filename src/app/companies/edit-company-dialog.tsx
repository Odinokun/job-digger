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
import { useActionState, useEffect, useState, useTransition } from "react";

import { useActionFailedToast } from "@/app/components/use-action-failed-toast";
import { prepareCareerSource } from "@/lib/companies/career-source";
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
  // Підпис джерела й текст про дублікат задаються у двох модалках, тому їхні
  // тексти лежать рівнем вище, поряд із `urlErrors`.
  const tShared = useTranslations("CompaniesPage");
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
  // Відмова, яку видно ще до Save: ту саму перевірку робить і сервер, але
  // чекати на надсилання, щоб побачити `ftp://`, нема за чим.
  const [newSourceRefusal, setNewSourceRefusal] = useState<
    | { problem: "source-url"; reason: UrlRefusalReason }
    | { problem: "source-duplicate" }
    | null
  >(null);
  const [, startSubmit] = useTransition();
  // Чи надсилали форму після відкриття вікна: `useActionState` переживає
  // закриття модалки, і без прапорця наступне відкриття показувало б відмову
  // минулого разу. Те саме в модалці Add company.
  const [isSubmitted, setSubmitted] = useState(false);

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
   * Перевіряє введену адресу на виході з поля - тією самою чистою функцією,
   * якою потім скористається сервер (`prepareCareerSource` у `src/lib`).
   *
   * Серверну перевірку це не заміняє: поля приходять із клієнта, а між
   * перевіркою і вставкою джерела могли змінитися. Зате крива адреса й
   * дублікат видні одразу, а не аж після Save.
   */
  function checkNewSource() {
    const typed = newSource.url.trim();

    // Порожнє поле - це «джерела не додаємо», а не помилка.
    if (typed === "") {
      setNewSourceRefusal(null);
      return;
    }

    const prepared = prepareCareerSource({
      url: typed,
      // Позначені до видалення не враховуємо: після Save їх уже не буде, тому
      // та сама адреса дублікатом не стане.
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

  // Клієнтська відмова має перевагу: вона свіжіша за стан минулого надсилання.
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
        : null;

  return (
    <>
      <Button size="sm" variant="secondary" onPress={openDialog}>
        {t("open")}
      </Button>

      <Modal.Backdrop isOpen={overlay.isOpen} onOpenChange={overlay.setOpen}>
        {/* Довгий вміст скролиться всередині вікна: без цього
                  `modal__dialog` обрізає його (`overflow-clip`), і в компанії
                  з трьома джерелами блок додавання та кнопки опинялися за
                  межею вікна - до них не було як дотягнутися. */}
        <Modal.Container scroll="inside">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{t("title")}</Modal.Heading>
            </Modal.Header>

            {/* Форма надсилається вручну, а не через `action={submit}`:
                React після дії робить формі `reset`, і React Aria повідомляє
                `onChange("")`, через що введене зникало навіть із
                контрольованих полів. Деталі - у модалці Add company. */}
            {/* Форма - проміжний елемент між `Modal.Dialog` і `Modal.Body`,
                тому вона мусить сама бути колонкою flex: інакше обмеження
                висоти до тіла не доходить, і скрол усередині вікна не
                працює - кнопки опиняються за нижнім краєм. */}
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

                              {/* Видалення - небезпечна дія, тому кнопка
                                  червона: обведена, доки джерело лишається, і
                                  залита, коли воно вже позначене. HeroUI
                                  `outline` рамки не малює (лише прозорий фон),
                                  тому рамка й колір тексту задані утилітами, а
                                  `--button-fg` перебивається змінною: сам
                                  `text-danger` програв би правилу
                                  `color: var(--button-fg)` з базового класу. */}
                              <Button
                                size="sm"
                                variant={isRemoved ? "danger" : "outline"}
                                className={
                                  isRemoved
                                    ? ""
                                    : "border border-danger [--button-fg:var(--color-danger)]"
                                }
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
                              aria-label={tShared("sourceLabel")}
                              value={labels[source.id] ?? ""}
                              onChange={(value) =>
                                changeLabel(source.id, value)
                              }
                              isDisabled={isRemoved}
                            >
                              <Input
                                placeholder={tShared("sourceLabelPlaceholder")}
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
                    onChange={(url) => {
                      // Правка знімає відмову: текст про неї стосувався
                      // попереднього значення.
                      setNewSourceRefusal(null);
                      setNewSource((current) => ({ ...current, url }));
                    }}
                    onBlur={checkNewSource}
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
                    <Label>{tShared("sourceLabel")}</Label>
                    <Input placeholder={tShared("sourceLabelPlaceholder")} />
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
