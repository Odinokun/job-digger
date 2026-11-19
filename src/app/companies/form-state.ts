import type { CheckStatus } from "@/lib/checks/check-status";
import type { CompanyListItem } from "@/lib/companies/company-list";
import type { Cursor } from "@/lib/pagination/cursor";
import type { AddCompanyResult } from "@/server/companies/add";
import type { DeleteCompanyResult } from "@/server/companies/delete";
import type { AddCareerSourceResult } from "@/server/companies/sources";
import type { UpdateCompanyResult } from "@/server/companies/update";

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
 *
 * Відмова їде сюди цілою, як і в Add company: у `source-url` є ще й причина,
 * через яку адресу не прийняли, і звужений `problem` її втрачав би.
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
  | { status: "failed"; result: Extract<UpdateCompanyResult, { ok: false }> }
  | { status: "failed-unexpectedly" };

export const EDIT_COMPANY_INITIAL_STATE: EditCompanyFormState = {
  status: "idle",
};

/**
 * Стан діалогу підтвердження видалення.
 *
 * Успіх не віддає нічого, крім факту: рядка компанії більше немає, а її id
 * список і так знає - саме його рядок він прибирає зі себе.
 *
 * `not-found` сюди доходить, якщо компанію видалили в іншій вкладці, поки
 * діалог був відкритий. Для списку це той самий результат - компанії немає, -
 * тому рядок прибирається й тут, просто текст інший.
 */
export type DeleteCompanyFormState =
  | { status: "idle" }
  | { status: "deleted" }
  | { status: "failed"; result: Extract<DeleteCompanyResult, { ok: false }> }
  | { status: "failed-unexpectedly" };

export const DELETE_COMPANY_INITIAL_STATE: DeleteCompanyFormState = {
  status: "idle",
};

/**
 * Чим закінчилася пропозиція «додати цю адресу карʼєрною сторінкою знайденої
 * компанії» в модалці Add company.
 *
 * `company` - рядок компанії, якій дісталося джерело, або `null`, якщо вона
 * цій вкладці не належить: список замінює в себе саме його.
 */
export type AddCareerSourceFormState =
  /**
   * `companyId` потрібен окремо від рядка: коли компанія цій вкладці не
   * належить, `company` приходить як `null`, а прибрати зі списку треба саме
   * її рядок.
   */
  | { status: "added"; companyId: string; company: CompanyListItem | null }
  | { status: "failed"; result: Extract<AddCareerSourceResult, { ok: false }> }
  | { status: "failed-unexpectedly" };

/**
 * Наступна порція списку компаній або факт збою.
 *
 * Помилку не розрізняємо: показати її нічим, крім того самого сповіщення.
 */
export type LoadMoreCompaniesResult =
  | { ok: true; items: CompanyListItem[]; nextCursor: Cursor | null }
  | { ok: false };

/**
 * Рядок компанії після Check now або факт збою. `company: null` - компанії вже
 * немає у вкладці (її видалили в іншій вкладці браузера), і список її прибирає.
 * Невдалі джерела - не збій: перевірка відбулася, а їхній стан у самому рядку.
 */
export type CheckCompanyNowResult =
  { ok: true; company: CompanyListItem | null } | { ok: false };

/**
 * Результат Check all: скільки джерел поставлено в чергу і стан перевірки
 * одразу після старту (з ним індикатор видно без чекання на опитування) або
 * чому перевірка не стартувала. `unexpected` - збій, який показується спільним toast.
 */
export type StartCheckAllResult =
  | { ok: true; total: number; status: CheckStatus }
  | {
      ok: false;
      reason: "already-running" | "nothing-to-check" | "unexpected";
    };
