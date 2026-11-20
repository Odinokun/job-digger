"use server";

import { runAction } from "@/app/action-result";
import { revalidateHeaderCounts } from "@/app/components/header-counts";
import { parseCompaniesTab } from "@/lib/companies/company-list";
import { absoluteCompanyUrl, normalizeCompanyUrl } from "@/lib/companies/url";
import type { Cursor } from "@/lib/pagination/cursor";
import { startCheckAll } from "@/server/checks/check-all";
import { getCheckStatus } from "@/server/checks/check-status";
import { checkCompany } from "@/server/checks/check-company";
import { startFindNewPages } from "@/server/checks/find-new-pages";
import { addCompany } from "@/server/companies/add";
import { deleteCompany } from "@/server/companies/delete";
import { findCompanyInTab, listCompanies } from "@/server/companies/list";
import { addCareerSource, addCareerSources } from "@/server/companies/sources";
import { findCompaniesWithSources } from "@/server/companies/source-duplicates";
import { updateCompany } from "@/server/companies/update";
import { discoverSources } from "@/server/discovery/discover";
import { getDb } from "@/server/db/client";
import { getSystemUser } from "@/server/db/system-user";
import { httpClient } from "@/server/http/http-client";
import { setCompanyVacanciesRead } from "@/server/vacancies/marks";

import type {
  AddCareerSourceFormState,
  AddCompanyFormState,
  CheckCompanyNowResult,
  DeleteCompanyFormState,
  EditCompanyFormState,
  FindPagesResult,
  LoadMoreCompaniesResult,
  StartCheckAllResult,
  StartFindNewPagesResult,
} from "./form-state";

/**
 * Обгортка Server Action над `addCompany`.
 *
 * Сама нічого не вирішує: читає поля форми, бере користувача й передає роботу
 * серверному модулю. Форма надсилається з клієнта, тому поля тут - недовірений
 * ввід, і перевіряє їх `addCompany`.
 */
export async function addCompanyAction(
  _state: AddCompanyFormState,
  formData: FormData,
): Promise<AddCompanyFormState> {
  const tab = parseCompaniesTab(formData.get("tab"));

  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    const result = await addCompany(db, {
      userId: user.id,
      name: readField(formData, "name"),
      url: readField(formData, "url"),
      careerUrl: readField(formData, "careerUrl"),
      // Вибрані знахідки Find pages: галочки списку з `name="foundUrl"`.
      foundUrls: formData
        .getAll("foundUrl")
        .filter((value): value is string => typeof value === "string"),
      // Прапорець зʼявляється у формі лише після попередження - про домен або
      // про однакову назву. Один на обидва: користувач підтверджує рішення
      // «усе одно додати», а не кожну перевірку окремо.
      confirmed: formData.get("confirmed") === "true",
    });

    if (!result.ok) {
      return result;
    }

    // Рядок для списку: без нього клієнт мусив би перечитувати сторінку, а з
    // нею й дозавантажені порції.
    const company = await findCompanyInTab(db, {
      userId: user.id,
      companyId: result.companyId,
      tab,
    });

    // Компанія на Tracked - у неї є джерела, що відстежуються, і її одразу
    // перевіряють (docs/discovery-and-parsing.md, розділ 5, пункт 7).
    const isTracked =
      tab === "tracked"
        ? company !== null
        : (await findCompanyInTab(db, {
            userId: user.id,
            companyId: result.companyId,
            tab: "tracked",
          })) !== null;

    return {
      ok: true as const,
      company,
      firstCheck: isTracked ? result.companyId : null,
    };
  });

  if (!outcome.ok) {
    return { status: "failed-unexpectedly" };
  }

  const result = outcome.value;

  if (!result.ok) {
    return { status: "failed", result };
  }

  // Рядок список вставить сам, а лічильники вкладок і шапки рендерить сервер.
  revalidateHeaderCounts();

  return {
    status: "added",
    company: result.company,
    firstCheck: result.firstCheck,
  };
}

/**
 * Find pages у модалці Add company: пошук кар'єрних джерел за сайтом і назвою
 * (`discoverSources`, docs/discovery-and-parsing.md, розділ 5).
 *
 * Нічого не змінює - лише читає чужі сайти, - але Server Action, бо пошук
 * ходить у мережу з сервера. Аргументи - недовірений ввід, тому адреса
 * перевіряється тут: крива дає ту саму відмову, що й Save.
 *
 * `companyId` - пошук для вже доданої компанії (Find pages на картці Not
 * tracked, задача 5.14): її власні джерела вже на картці, тож зі знахідок
 * вони прибираються. Id - недовірений ввід, але лише фільтрує знахідки:
 * компанії шукаються серед компаній самого користувача.
 */
export async function findPagesAction(
  url: unknown,
  name: unknown,
  companyId?: unknown,
): Promise<FindPagesResult> {
  const typedUrl = typeof url === "string" ? url.trim() : "";
  const typedName = typeof name === "string" ? name.trim() : "";

  if (typedUrl === "" && typedName === "") {
    return { ok: false, problem: "address-required" };
  }

  let siteUrl: string | null = null;
  if (typedUrl !== "") {
    const normalized = normalizeCompanyUrl(typedUrl);
    if (!normalized.ok) {
      return { ok: false, problem: "company-url", reason: normalized.reason };
    }
    siteUrl = absoluteCompanyUrl(typedUrl);
  }

  const outcome = await runAction(async () => {
    const findings = await discoverSources(
      { siteUrl, name: typedName },
      httpClient,
    );
    const db = getDb();
    const user = await getSystemUser(db);
    const tracked = await findCompaniesWithSources(db, {
      userId: user.id,
      urls: findings.map((finding) => finding.url),
    });

    return findings
      .map((finding) => ({
        ...finding,
        trackedIn: tracked.get(finding.url) ?? null,
      }))
      .filter(
        (finding) =>
          finding.trackedIn === null || finding.trackedIn.id !== companyId,
      );
  });

  return outcome.ok
    ? { ok: true, findings: outcome.value }
    : { ok: false, problem: "failed-unexpectedly" };
}

/** Поле форми як рядок: `FormData` віддає ще й файли, їх тут бути не може. */
function readField(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

/**
 * Наступні 50 компаній після курсора.
 *
 * Аргументи приходять із клієнта й нічим не захищені: Server Action доступний
 * прямим POST-запитом, а не лише через кнопку (документація Next, «Server
 * Functions are reachable via direct POST requests»). Тому вкладка й курсор
 * розбираються тут, а користувач береться на сервері - з клієнта він не
 * передається взагалі.
 */
export async function loadMoreCompaniesAction(
  tab: unknown,
  after: unknown,
): Promise<LoadMoreCompaniesResult> {
  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    return listCompanies(db, {
      userId: user.id,
      tab: parseCompaniesTab(tab),
      // `after` чистить сам `listCompanies` через `parseCursor`.
      after: after as Cursor | null,
    });
  });

  if (!outcome.ok) {
    return { ok: false };
  }

  return { ok: true, ...outcome.value };
}

/** Більше рядків одним перечитуванням не віддаємо - захист від хибного числа. */
const MAX_RELOAD = 500;

/**
 * Перечитує з початку стільки компаній, скільки вже показано, - після кінця
 * загальної перевірки: статуси й «Last checked» змінились, а рядки списку живуть
 * у клієнтському стані. Скільки показано - недовірене число, тож обмежене.
 */
export async function reloadCompaniesAction(
  tab: unknown,
  shown: unknown,
): Promise<LoadMoreCompaniesResult> {
  const limit =
    typeof shown === "number" && Number.isInteger(shown) && shown > 0
      ? Math.min(shown, MAX_RELOAD)
      : undefined;

  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    return listCompanies(db, {
      userId: user.id,
      tab: parseCompaniesTab(tab),
      limit,
    });
  });

  return outcome.ok ? { ok: true, ...outcome.value } : { ok: false };
}

/**
 * Check now для однієї компанії: перевіряє її джерела й повертає оновлений
 * рядок списку.
 *
 * Аргументи - недовірений ввід, як і в `loadMoreCompaniesAction`: компанія
 * шукається за користувачем із сервера, тож чужу перевірити не вийде. Дія
 * чекає, поки прочитаються всі джерела. Під час загальної перевірки - відмова
 * `check-running`: компанія і так перевіряється.
 */
export async function checkCompanyNowAction(
  companyId: unknown,
  tab: unknown,
): Promise<CheckCompanyNowResult> {
  if (typeof companyId !== "string") {
    return { ok: false };
  }

  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    const checked = await checkCompany(db, httpClient, {
      userId: user.id,
      companyId,
      checkedAt: new Date(),
    });

    if (!checked.ok && checked.reason === "check-running") {
      return "check-running" as const;
    }

    // `not-found` - компанії вже немає, і `null` прибирає її рядок.
    return checked.ok
      ? findCompanyInTab(db, {
          userId: user.id,
          companyId,
          tab: parseCompaniesTab(tab),
        })
      : null;
  });

  if (!outcome.ok) {
    return { ok: false };
  }

  if (outcome.value === "check-running") {
    return { ok: false, reason: "check-running" };
  }

  // Перевірка додає й прибирає вакансії - лічильник непрочитаних у шапці.
  revalidateHeaderCounts();

  return { ok: true, company: outcome.value };
}

/**
 * Check all з вкладки Tracked (docs/checks-and-queue.md, розділ 8): ставить
 * у чергу всі джерела, що відстежуються, і одразу повертається - джерела
 * перевіряє цикл черги, а інтерфейс не блокується.
 */
export async function startCheckAllAction(): Promise<StartCheckAllResult> {
  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    // Ручний Check all - лише перша сторінка кожного джерела (задача 6.16).
    const started = await startCheckAll(db, {
      userId: user.id,
      depthMode: "first-page",
      now: new Date(),
    });

    return started.ok
      ? {
          ok: true as const,
          total: started.total,
          status: await getCheckStatus(db, { userId: user.id }),
        }
      : started;
  });

  if (!outcome.ok) {
    return { ok: false, reason: "unexpected" };
  }

  return outcome.value;
}

/**
 * Find new pages на вкладці Not tracked: ставить у чергу пошук для кожної її
 * компанії (`startFindNewPages`) і повертає стан для опитування, як Check all.
 */
export async function startFindNewPagesAction(): Promise<StartFindNewPagesResult> {
  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    const started = await startFindNewPages(db, {
      userId: user.id,
      now: new Date(),
    });

    return started.ok
      ? {
          ok: true as const,
          total: started.total,
          status: await getCheckStatus(db, { userId: user.id }),
        }
      : started;
  });

  if (!outcome.ok) {
    return { ok: false, reason: "unexpected" };
  }

  return outcome.value;
}

/**
 * Обгортка Server Action над `updateCompany`.
 *
 * Поля форми - недовірений ввід, тому id компанії й джерел ідуть у
 * `updateCompany` як є: там вони перевіряються умовами запиту (компанія - за
 * користувачем, джерела - за компанією), а не довірою до клієнта.
 */
export async function updateCompanyAction(
  _state: EditCompanyFormState,
  formData: FormData,
): Promise<EditCompanyFormState> {
  const companyId = readField(formData, "companyId");
  const tab = parseCompaniesTab(formData.get("tab"));

  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    const result = await updateCompany(db, {
      userId: user.id,
      companyId,
      name: readField(formData, "name"),
      removeSourceIds: formData
        .getAll("removeSourceIds")
        .filter((value): value is string => typeof value === "string"),
      sourceLabels: typedLabels(formData),
      // Порожнє поле адреси - це «джерело не додаємо», а не крива адреса: той
      // самий підхід, що з карʼєрною сторінкою в модалці Add company.
      addSource: addedSource(formData),
    });

    if (!result.ok) {
      return result;
    }

    // Той самий рядок, яким його тепер бачить список: без цього клієнт мусив
    // би або перечитувати всі дозавантажені порції, або вгадувати результат.
    return {
      ok: true as const,
      company: await findCompanyInTab(db, { userId: user.id, companyId, tab }),
    };
  });

  if (!outcome.ok) {
    return { status: "failed-unexpectedly" };
  }

  const result = outcome.value;

  if (!result.ok) {
    return { status: "failed", result };
  }

  // Рядок список оновить сам, а от лічильники вкладок рендерить сервер:
  // компанія без джерел переїжджає між Tracked і Not tracked. Прибране джерело
  // забирає свої вакансії - тож і лічильник непрочитаних у шапці.
  revalidateHeaderCounts();

  return { status: "saved", company: result.company };
}

/**
 * Обгортка Server Action над `deleteCompany`.
 *
 * Вкладки тут немає, на відміну від Edit: після видалення перечитувати рядок
 * нічим, список просто прибирає його зі себе. Id компанії - недовірений ввід,
 * права на неї перевіряє запит у `deleteCompany`.
 */
export async function deleteCompanyAction(
  _state: DeleteCompanyFormState,
  formData: FormData,
): Promise<DeleteCompanyFormState> {
  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    return deleteCompany(db, {
      userId: user.id,
      companyId: readField(formData, "companyId"),
    });
  });

  if (!outcome.ok) {
    return { status: "failed-unexpectedly" };
  }

  const result = outcome.value;

  if (!result.ok) {
    return { status: "failed", result };
  }

  // Рядок список прибере сам, а лічильники вкладок рендерить сервер. Разом із
  // компанією зникають її вакансії - тож і лічильник непрочитаних у шапці.
  revalidateHeaderCounts();

  return { status: "deleted" };
}

/**
 * Додає вставлену адресу карʼєрною сторінкою вже доданої компанії.
 *
 * Викликається не з форми, а кнопкою в модалці Add company, коли адреса
 * збіглася з уже доданою компанією (картка 2.16). Аргументи приходять із
 * клієнта й нічим не захищені - Server Action доступний прямим POST-запитом,
 * тому тут вони зводяться до рядків, а права на компанію перевіряє
 * `addCareerSource` своїм запитом.
 */
export async function addCareerSourceAction(
  companyId: unknown,
  url: unknown,
  label: unknown,
  tab: unknown,
): Promise<AddCareerSourceFormState> {
  const company = asString(companyId);
  const currentTab = parseCompaniesTab(tab);

  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    const result = await addCareerSource(db, {
      userId: user.id,
      companyId: company,
      url: asString(url),
      label: asString(label),
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true as const,
      company: await findCompanyInTab(db, {
        userId: user.id,
        companyId: company,
        tab: currentTab,
      }),
    };
  });

  if (!outcome.ok) {
    return { status: "failed-unexpectedly" };
  }

  const result = outcome.value;

  if (!result.ok) {
    return { status: "failed", result };
  }

  // Рядок список замінить сам, а лічильники вкладок і шапки рендерить сервер:
  // із новим джерелом компанія переїжджає з Not tracked у Tracked.
  revalidateHeaderCounts();

  return { status: "added", companyId: company, company: result.company };
}

/**
 * Додає вибрані знахідки Find pages джерелами вже доданої компанії - модалка
 * Find pages на картці Not tracked (задача 5.14).
 *
 * Аргументи - недовірений ввід: адреси зводяться до рядків, а права на
 * компанію й самі адреси перевіряє `addCareerSources`. Перша перевірка після
 * Save - справа клієнта, як і після Add company (5.09).
 */
export async function addFoundPagesAction(
  companyId: unknown,
  urls: unknown,
  tab: unknown,
): Promise<AddCareerSourceFormState> {
  const company = asString(companyId);
  const currentTab = parseCompaniesTab(tab);
  const picked = Array.isArray(urls)
    ? urls.filter((url): url is string => typeof url === "string")
    : [];

  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    const result = await addCareerSources(db, {
      userId: user.id,
      companyId: company,
      sources: picked.map((url) => ({ url })),
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true as const,
      company: await findCompanyInTab(db, {
        userId: user.id,
        companyId: company,
        tab: currentTab,
      }),
    };
  });

  if (!outcome.ok) {
    return { status: "failed-unexpectedly" };
  }

  const result = outcome.value;

  if (!result.ok) {
    return { status: "failed", result };
  }

  // Лічильники вкладок і шапки рендерить сервер: із джерелом, що читається,
  // компанія переїжджає з Not tracked у Tracked.
  revalidateHeaderCounts();

  return { status: "added", companyId: company, company: result.company };
}

/** Аргумент Server Action як рядок: із клієнта може приїхати будь-що. */
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Префікс полів із підписами джерел: далі в назві стоїть id джерела. */
const SOURCE_LABEL_PREFIX = "sourceLabel.";

/**
 * Підписи наявних джерел із полів форми: id джерела - уведений підпис.
 *
 * Назва поля несе id (`sourceLabel.<id>`), а не окремий паралельний масив
 * ідентифікаторів: `FormData` не гарантує, що два масиви приїдуть однакової
 * довжини, і підпис міг би дістатися чужому джерелу. Самі id - недовірений
 * ввід, тому їх перевіряє запит у `updateCompany`.
 */
function typedLabels(formData: FormData): Record<string, string> {
  const labels: Record<string, string> = {};

  for (const [field, value] of formData.entries()) {
    if (field.startsWith(SOURCE_LABEL_PREFIX) && typeof value === "string") {
      labels[field.slice(SOURCE_LABEL_PREFIX.length)] = value;
    }
  }

  return labels;
}

/** Нове карʼєрне джерело з полів модалки Edit або `undefined`, якщо його не вводили. */
function addedSource(
  formData: FormData,
): { url: string; label?: string } | undefined {
  const url = readField(formData, "addSourceUrl").trim();

  return url === ""
    ? undefined
    : { url, label: readField(formData, "addSourceLabel") };
}

/**
 * Mark all as read / Mark all as unread для компанії (docs/ui.md, розділ 4.2).
 * Аргументи - недовірений ввід: id перевіряє `setCompanyVacanciesRead` (UUID і
 * власник), а позначка має бути саме булевою. `revalidateHeaderCounts` - заради
 * лічильника в шапці і щоб Jobs, відкритий одразу після дії, не показав список
 * до запису (задача 3.22).
 */
export async function setCompanyVacanciesReadAction(
  companyId: unknown,
  isRead: unknown,
): Promise<{ ok: true; changed: number } | { ok: false }> {
  if (typeof companyId !== "string" || typeof isRead !== "boolean") {
    return { ok: false };
  }

  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    return setCompanyVacanciesRead(db, { userId: user.id, companyId, isRead });
  });

  if (!outcome.ok) {
    return { ok: false };
  }

  revalidateHeaderCounts();

  return { ok: true, changed: outcome.value };
}
