import type { CompanyListItem } from "@/lib/companies/company-list";
import type { Cursor } from "@/lib/pagination/cursor";
import type { AddCompanyResult } from "@/server/companies/add";

/**
 * Стани форм сторінки Companies і їхні початкові значення.
 *
 * Окремо від `actions.ts`, бо той файл починається з `"use server"`, а такий
 * файл може експортувати **лише async-функції**: будь-який інший експорт -
 * помилка «A "use server" file can only export async functions, found object»
 * (https://nextjs.org/docs/messages/invalid-use-server-value). Типи стираються
 * при збірці й проходять, а константа початкового стану - ні.
 *
 * Цей файл імпортують і клієнтські модалки. `AddCompanyResult` приходить сюди
 * з `src/server`, але лише як тип: `import type` стирається, тому серверний код
 * у клієнтський бандл не потрапляє.
 */

/**
 * Стан форми Add company між надсиланнями.
 *
 * Успіх не віддає рядок компанії, лише факт: повернене з action серіалізується
 * і йде на клієнт, тому віддаємо те, що потрібно інтерфейсу, а не запис із бази
 * (документація Next, «Constrain return values»).
 */
export type AddCompanyFormState =
  | { status: "idle" }
  /**
   * Додано. `company` - рядок для поточної вкладки або `null`, якщо компанія
   * потрапила в іншу: без карʼєрної сторінки вона йде в Not tracked.
   *
   * Рядок повертається, щоб список вставив його в себе, не перечитуючи
   * дозавантажені порції.
   */
  | { status: "added"; company: CompanyListItem | null }
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
 * Стан модалки Edit між надсиланнями.
 *
 * `not-found` сюди доходить, якщо компанію видалили в іншій вкладці, поки
 * модалка була відкрита.
 */
export type EditCompanyFormState =
  | { status: "idle" }
  /**
   * Збережено. `company` - той самий рядок, яким його тепер показує список,
   * або `null`, якщо компанія вкладці більше не належить: без карʼєрних
   * сторінок вона переїжджає в Not tracked.
   *
   * Рядок повертається сюди, щоб список замінив у себе саме його й не
   * перечитував дозавантажені порції.
   */
  | { status: "saved"; company: CompanyListItem | null }
  | { status: "failed"; problem: "name-required" | "not-found" }
  | { status: "failed-unexpectedly" };

export const EDIT_COMPANY_INITIAL_STATE: EditCompanyFormState = {
  status: "idle",
};

/**
 * Наступна порція списку компаній або факт збою.
 *
 * Помилку не розрізняємо: показати її нічим, крім того самого сповіщення.
 */
export type LoadMoreCompaniesResult =
  | { ok: true; items: CompanyListItem[]; nextCursor: Cursor | null }
  | { ok: false };
