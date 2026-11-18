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

import { WithTooltip } from "@/app/components/icon-button";
import { useActionFailedToast } from "@/app/components/use-action-failed-toast";
import type {
  CompaniesTab,
  CompanyListItem,
} from "@/lib/companies/company-list";
import type { AddCareerSourceFormState } from "./form-state";
import { suggestCompanyFields } from "@/lib/companies/suggest";
import {
  normalizeCompanyUrl,
  type UrlRefusalReason,
} from "@/lib/companies/url";

import { addCareerSourceAction, addCompanyAction } from "./actions";
import { ADD_COMPANY_INITIAL_STATE } from "./form-state";
import { URL_ERROR_KEYS } from "./url-errors";

/** Порожня форма: і початковий стан, і те, до чого вона вертається після успіху. */
const EMPTY_FIELDS = { url: "", name: "", careerUrl: "" };

/** Поля, у які підказка не лізе, якщо користувач уже написав там своє. */
const EMPTY_EDITS = { name: false, careerUrl: false };

/** Жодної клієнтської відмови: і початковий стан, і скидання при правці. */
const EMPTY_REFUSALS = { url: null, careerUrl: null };

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
interface AddCompanyDialogProps {
  /** Вкладка, яку зараз видно: від неї залежить, чи потрапить компанія в цей список. */
  tab: CompaniesTab;
  /**
   * Доданий рядок або `null`, якщо компанія належить іншій вкладці.
   * Список вставляє його в себе, тому дозавантажені порції лишаються.
   */
  onAdded: (added: CompanyListItem | null) => void;
  /**
   * Компанія, якій дісталася вставлена адреса ще одним карʼєрним джерелом.
   * Рядок уже є в списку, тому його заміщають, а не додають.
   */
  onSourceAdded: (companyId: string, saved: CompanyListItem | null) => void;
}

export function AddCompanyDialog({
  tab,
  onAdded,
  onSourceAdded,
}: AddCompanyDialogProps) {
  const t = useTranslations("CompaniesPage.addCompany");
  const tUrlError = useTranslations("CompaniesPage.urlErrors");
  // Підпис джерела й текст про дублікат задаються у двох модалках, тому їхні
  // тексти лежать рівнем вище, поряд із `urlErrors`.
  const tShared = useTranslations("CompaniesPage");
  const tCommon = useTranslations("Common");
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

  // Пропозиція «додати цю адресу карʼєрною сторінкою знайденої компанії» -
  // окрема дія, а не ще одне надсилання форми: компанію вона не додає, тому й
  // стан у неї свій.
  const [sourceState, setSourceState] =
    useState<AddCareerSourceFormState | null>(null);
  const [isAddingSource, startAddingSource] = useTransition();
  // Підпис для адреси, яка стане ще одним джерелом знайденої компанії: там
  // він потрібен так само, як у модалці Edit - трьох фільтрів однієї сторінки
  // інакше не розрізнити.
  const [sourceLabel, setSourceLabel] = useState("");
  // Чи надсилали форму після того, як вікно відкрили. `useActionState` живе
  // стільки ж, скільки компонент, а модалка лише ховається - без цього
  // прапорця наступне відкриття одразу показувало б відмову минулого разу
  // («Already added as ...» ще до того, як користувач щось увів).
  const [isSubmitted, setSubmitted] = useState(false);
  const [, startSubmit] = useTransition();
  // Відмови, які видно ще до Save. Та сама перевірка повториться на сервері -
  // поля приходять із клієнта, - але `ftp://` нема чого везти туди й назад.
  const [refusals, setRefusals] = useState<{
    url: UrlRefusalReason | null;
    careerUrl: UrlRefusalReason | null;
  }>(EMPTY_REFUSALS);

  // Модалку закриває успіх, а не сама кнопка: доки компанія не збереглася,
  // користувач має бачити свої дані й повідомлення про помилку.
  // Закриття взяте окремою змінною, бо `useOverlayState` повертає новий обʼєкт
  // на кожен рендер (сама `close` стабільна). Із цілим `overlay` у залежностях
  // ефект перезапускався б постійно й на відкритті модалки одразу бачив би вже
  // відпрацьований успіх: вікно закривалося б миттєво, а кнопка виглядала б
  // мертвою.
  const closeDialog = overlay.close;

  useEffect(() => {
    if (state.status === "added") {
      onAdded(state.company);
      closeDialog();
    }
  }, [state, closeDialog, onAdded]);

  // Неочікуваний збій полю форми не належить: виправляти користувачеві нічого,
  // тому про нього повідомляє сповіщення, а вікно лишається відкритим зі
  // введеними даними.
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

  // Форма чиститься на відкритті, а не на успіху: поля контрольовані, тому
  // інакше наступне відкриття показало б минулу компанію. Скидання стоїть у
  // кнопці, а не в ефекті - ефект із `setState` дає каскадний рендер
  // (`react-hooks/set-state-in-effect`).
  function openDialog() {
    setFields(EMPTY_FIELDS);
    setEditedByHand(EMPTY_EDITS);
    setSuggested(false);
    setSourceState(null);
    setSourceLabel("");
    setSubmitted(false);
    setRefusals(EMPTY_REFUSALS);
    overlay.open();
  }

  function changeField(field: keyof typeof EMPTY_FIELDS, value: string) {
    setFields((previous) => ({ ...previous, [field]: value }));

    // Текст відмови стосувався попереднього значення поля.
    if (field !== "name") {
      setRefusals((previous) => ({ ...previous, [field]: null }));
    }

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

  /**
   * Зберігає вставлену адресу ще одним джерелом знайденої компанії.
   *
   * Адреса береться з поля карʼєрної сторінки: саме туди її поклала підказка,
   * коли впізнала в ній не головний сайт (`suggestCompanyFields`).
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
   * Перевіряє адресу на виході з поля.
   *
   * Порожнє поле помилкою не вважається: адреса компанії обовʼязкова, але про
   * це скаже Save, а не вихід із поля, у яке ще нічого не встигли ввести.
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

  // Помилка поля йде в `FieldError` разом з `isInvalid`: проп
  // `validationErrors` у встановленій версії живе на `Form`, а не на полі.
  const nameError =
    failure?.problem === "name-required" ? t("errors.nameRequired") : null;

  // Клієнтська відмова свіжіша за стан минулого надсилання, тому йде першою.
  const urlError = refusals.url
    ? tUrlError(URL_ERROR_KEYS[refusals.url])
    : failure?.problem === "company-url"
      ? tUrlError(URL_ERROR_KEYS[failure.reason])
      : failure?.problem === "already-added"
        ? t("errors.alreadyAdded", { name: failure.company.name })
        : null;

  // Стосується пари полів, а не одного, тому стоїть окремо, а не в `FieldError`.
  const addressError =
    failure?.problem === "address-required"
      ? t("errors.addressRequired")
      : null;

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
   * Компанії, яким можна віддати вставлену адресу замість створення нової
   * картки.
   *
   * Два випадки: точний збіг із сайтом уже доданої компанії (картка 2.16) і
   * збіг за назвою (картка 2.17) - одна компанія публікує вакансії на кількох
   * платформах, і кожна наступна адреса має лягати в наявну картку.
   *
   * Умова на поле карʼєрної сторінки спільна: якщо користувач вставив сам
   * головний сайт, додавати як джерело нічого.
   *
   * Потрібні тільки `id` і назва - цього досить і для кнопки, і для виклику.
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
        {/* Довгий вміст скролиться всередині вікна: без цього
                  `modal__dialog` обрізає його (`overflow-clip`), і в компанії
                  з трьома джерелами блок додавання та кнопки опинялися за
                  межею вікна - до них не було як дотягнутися. */}
        <Modal.Container scroll="inside">
          <Modal.Dialog>
            <WithTooltip label={tCommon("close")}>
              <Modal.CloseTrigger aria-label={tCommon("close")} />
            </WithTooltip>
            <Modal.Header>
              <Modal.Heading>{t("title")}</Modal.Heading>
            </Modal.Header>

            {/* Форма надсилається вручну, а не через `action={submit}`:
                React після дії робить формі `reset`, React Aria бачить цю
                подію й повідомляє `onChange("")`, тому навіть контрольовані
                поля втрачали введене - після відмови «вже додана» адреса
                зникала разом із пропозицією додати її джерелом. Виклик у
                `startTransition` обовʼязковий, інакше `isPending` з
                `useActionState` не оновлюється (попередження React «An async
                function with useActionState was called outside of a
                transition»). Прогресивного покращення це не знімає: модалку
                все одно відкриває JavaScript. */}
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
              {/* Вкладка потрібна серверу, щоб сказати, чи показувати нову
                  компанію в цьому списку. */}
              <input type="hidden" name="tab" value={tab} />
              <Modal.Body className="flex flex-col gap-4">
                {/* Адреса стоїть першою: з неї заповнюються два поля нижче. */}
                {/* `isRequired` немає: компанію, знайдену лише на джоб-борді,
                    сайт вигадувати не змушуємо. Правило «хоча б одна з двох
                    адрес» стосується пари полів, тому його показує рядок над
                    кнопками, а не підпис під полем (картка 2.17). */}
                <TextField
                  autoFocus
                  fullWidth
                  name="url"
                  value={fields.url}
                  onChange={(value) => changeField("url", value)}
                  onBlur={() => {
                    suggestFromUrl();
                    checkAddress("url");
                  }}
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
                  onBlur={() => checkAddress("careerUrl")}
                  isInvalid={careerUrlError !== null}
                >
                  <Label>{t("careerUrl")}</Label>
                  <Input placeholder={t("careerUrlPlaceholder")} />
                  <FieldError>{careerUrlError}</FieldError>
                  <span className="text-sm text-muted">
                    {t("careerUrlHint")}
                  </span>
                </TextField>

                {sameName ? (
                  <div className="flex flex-col gap-1 text-sm">
                    <p>{t("sameNameWarning")}</p>
                    <ul className="list-inside list-disc text-muted">
                      {sameName.companies.map((company) => (
                        <li key={company.id}>
                          {/* Компанія без сайту - саме той випадок, заради
                              якого це попередження й зʼявилося, тому замість
                              порожнечі тут підпис (картка 2.17). */}
                          {company.name} - {company.url ?? t("noSite")}
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
                    {/* Той самий прапорець, що й у addCompany: повторний Save
                        проходить попередження, точний дублікат - ні. */}
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

                    {/* Підпис спільний на всі кнопки: він описує саме цю
                        адресу, а не компанію, якій вона дістанеться. Ним
                        розрізняють платформи однієї компанії в списку джерел. */}
                    <TextField
                      fullWidth
                      value={sourceLabel}
                      onChange={setSourceLabel}
                    >
                      <Label>{tShared("sourceLabel")}</Label>
                      <Input placeholder={tShared("sourceLabelPlaceholder")} />
                    </TextField>

                    {/* Кнопка на кожну знайдену компанію: однойменних може бути
                        кілька, і яка з них основна - знає тільки користувач.

                        Кнопки кличуть окрему дію, тому `type="button"`: інакше
                        вони надіслали б форму ще раз і знову впали б у те саме
                        попередження. */}
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

                {/* Відмова про пару полів: яке з двох заповнити - вибір
                    користувача, тому текст стоїть під ними обома, а не в
                    одному `FieldError`. */}
                {addressError ? (
                  <p className="text-sm text-danger">{addressError}</p>
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
