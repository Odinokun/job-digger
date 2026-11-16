"use server";

import { revalidatePath } from "next/cache";

import { addCompany, type AddCompanyResult } from "@/server/companies/add";
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
  | { status: "failed"; result: Extract<AddCompanyResult, { ok: false }> };

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
  const db = getDb();
  const user = await getSystemUser(db);

  const result = await addCompany(db, {
    userId: user.id,
    name: readField(formData, "name"),
    url: readField(formData, "url"),
    careerUrl: readField(formData, "careerUrl"),
    // Прапорець зʼявляється у формі лише після попередження про домен.
    sameDomainConfirmed: formData.get("sameDomainConfirmed") === "true",
  });

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
