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
import type {
  CompaniesTab,
  CompanyListItem,
} from "@/lib/companies/company-list";
import type { AddCareerSourceFormState } from "./form-state";
import { suggestCompanyFields } from "@/lib/companies/suggest";

import { addCareerSourceAction, addCompanyAction } from "./actions";
import { ADD_COMPANY_INITIAL_STATE } from "./form-state";
import { URL_ERROR_KEYS } from "./url-errors";

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
  // Текст про дублікат джерела спільний із модалкою Edit, тому лежить рівнем
  // вище, поряд із `urlErrors`.
  const tSourceDuplicate = useTranslations("CompaniesPage");
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
  const [, startSubmit] = useTransition();

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

  /**
   * Зберігає вставлену адресу ще одним джерелом знайденої компанії.
   *
   * Адреса береться з поля карʼєрної сторінки: саме туди її поклала підказка,
   * коли впізнала в ній не головний сайт (`suggestCompanyFields`).
   */
  function addAsSource(companyId: string) {
    startAddingSource(async () => {
      setSourceState(
        await addCareerSourceAction(companyId, fields.careerUrl, "", tab),
      );
    });
  }

  const failure = state.status === "failed" ? state.result : null;
  const sameDomain = failure?.problem === "same-domain" ? failure : null;

  // Помилка поля йде в `FieldError` разом з `isInvalid`: проп
  // `validationErrors` у встановленій версії живе на `Form`, а не на полі.
  const nameError =
    failure?.problem === "name-required" ? t("errors.nameRequired") : null;

  const urlError =
    failure?.problem === "company-url"
      ? tUrlError(URL_ERROR_KEYS[failure.reason])
      : failure?.problem === "already-added"
        ? t("errors.alreadyAdded", { name: failure.company.name })
        : null;

  const sourceFailure =
    sourceState?.status === "failed" ? sourceState.result : null;

  const careerUrlError =
    failure?.problem === "career-url"
      ? tUrlError(URL_ERROR_KEYS[failure.reason])
      : sourceFailure?.problem === "source-url"
        ? tUrlError(URL_ERROR_KEYS[sourceFailure.reason])
        : sourceFailure?.problem === "source-duplicate"
          ? tSourceDuplicate("sourceDuplicate")
          : null;

  // Пропозиція зʼявляється лише тоді, коли адресу справді є що додати: при
  // точному збігу компанії й заповненому полі карʼєрної сторінки. Якщо
  // користувач вставив сам головний сайт, додавати нічого - лишається відмова.
  const alreadyAdded =
    failure?.problem === "already-added" && fields.careerUrl.trim() !== ""
      ? failure.company
      : null;

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
            <Modal.CloseTrigger />
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

                startSubmit(() => submit(fieldsToSend));
              }}
            >
              {/* Вкладка потрібна серверу, щоб сказати, чи показувати нову
                  компанію в цьому списку. */}
              <input type="hidden" name="tab" value={tab} />
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

                {alreadyAdded ? (
                  <div className="flex flex-col items-start gap-2 text-sm">
                    <p>{t("addAsSourceHint", { name: alreadyAdded.name })}</p>
                    {/* Кнопка кличе окрему дію, тому `type="button"`: інакше
                        вона надіслала б форму ще раз і знову впала б у
                        «вже додана». */}
                    <Button
                      type="button"
                      variant="secondary"
                      isPending={isAddingSource}
                      onPress={() => addAsSource(alreadyAdded.id)}
                    >
                      {t("addAsSource", { name: alreadyAdded.name })}
                    </Button>
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
