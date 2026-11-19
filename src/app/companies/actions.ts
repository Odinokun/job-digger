"use server";

import { revalidatePath } from "next/cache";

import { runAction } from "@/app/action-result";
import { revalidateUnreadCount } from "@/app/components/unread-count";
import { parseCompaniesTab } from "@/lib/companies/company-list";
import type { Cursor } from "@/lib/pagination/cursor";
import { startCheckAll } from "@/server/checks/check-all";
import { getCheckStatus } from "@/server/checks/check-status";
import { checkCompany } from "@/server/checks/check-company";
import { addCompany } from "@/server/companies/add";
import { deleteCompany } from "@/server/companies/delete";
import { findCompanyInTab, listCompanies } from "@/server/companies/list";
import { addCareerSource } from "@/server/companies/sources";
import { updateCompany } from "@/server/companies/update";
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
  LoadMoreCompaniesResult,
  StartCheckAllResult,
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
    return {
      ok: true as const,
      company: await findCompanyInTab(db, {
        userId: user.id,
        companyId: result.companyId,
        tab,
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

  // Рядок список вставить сам, а лічильники вкладок рендерить сервер.
  revalidatePath("/companies");

  return { status: "added", company: result.company };
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
  revalidateUnreadCount();

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

    const started = await startCheckAll(db, {
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
  revalidateUnreadCount();

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
  revalidateUnreadCount();

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

  // Рядок список замінить сам, а лічильники вкладок рендерить сервер: із новим
  // джерелом компанія переїжджає з Not tracked у Tracked.
  revalidatePath("/companies");

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
 * власник), а позначка має бути саме булевою. `revalidateUnreadCount` - заради
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

  revalidateUnreadCount();

  return { ok: true, changed: outcome.value };
}
