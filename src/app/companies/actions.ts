"use server";

import { revalidatePath } from "next/cache";

import { runAction } from "@/app/action-result";
import {
  parseCompaniesTab,
  type CompanyListItem,
} from "@/lib/companies/company-list";
import type { Cursor } from "@/lib/pagination/cursor";
import { addCompany, type AddCompanyResult } from "@/server/companies/add";
import { listCompanies } from "@/server/companies/list";
import { getDb } from "@/server/db/client";
import { getSystemUser } from "@/server/db/system-user";

/**
 * Стан форми Add company між надсиланнями.
 *
 * Успіх не віддає рядок компанії, лише факт: повернене з action серіалізується
 * і йде на клієнт, тому віддаємо те, що потрібно інтерфейсу, а не запис із бази
 * (документація Next, «Constrain return values»).
 */
export type AddCompanyFormState =
  | { status: "idle" }
  | { status: "added" }
  | { status: "failed"; result: Extract<AddCompanyResult, { ok: false }> }
  /**
   * Збій, якого форма не передбачала: база не піднята, запит упав.
   *
   * Окремо від `failed`: там причина належить полю форми й користувач може її
   * виправити, а тут виправляти нічого - лишається повторити дію.
   */
  | { status: "failed-unexpectedly" };

export const ADD_COMPANY_INITIAL_STATE: AddCompanyFormState = {
  status: "idle",
};

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
  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    return addCompany(db, {
      userId: user.id,
      name: readField(formData, "name"),
      url: readField(formData, "url"),
      careerUrl: readField(formData, "careerUrl"),
      // Прапорець зʼявляється у формі лише після попередження про домен.
      sameDomainConfirmed: formData.get("sameDomainConfirmed") === "true",
    });
  });

  if (!outcome.ok) {
    return { status: "failed-unexpectedly" };
  }

  const result = outcome.value;

  if (!result.ok) {
    return { status: "failed", result };
  }

  // Список компаній і лічильники вкладок читаються на сервері, тому без цього
  // нова компанія зʼявилася б лише після перезавантаження сторінки.
  revalidatePath("/companies");

  return { status: "added" };
}

/** Поле форми як рядок: `FormData` віддає ще й файли, їх тут бути не може. */
function readField(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

/**
 * Наступна порція списку компаній або факт збою.
 *
 * Помилку не розрізняємо: показати її нічим, крім того самого сповіщення.
 */
export type LoadMoreCompaniesResult =
  | { ok: true; items: CompanyListItem[]; nextCursor: Cursor | null }
  | { ok: false };

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
