"use server";

import { revalidatePath } from "next/cache";

import { runAction } from "@/app/action-result";
import { parseCompaniesTab } from "@/lib/companies/company-list";
import type { Cursor } from "@/lib/pagination/cursor";
import { addCompany } from "@/server/companies/add";
import { findCompanyInTab, listCompanies } from "@/server/companies/list";
import { updateCompany } from "@/server/companies/update";
import { getDb } from "@/server/db/client";
import { getSystemUser } from "@/server/db/system-user";

import type {
  AddCompanyFormState,
  EditCompanyFormState,
  LoadMoreCompaniesResult,
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
      // Прапорець зʼявляється у формі лише після попередження про домен.
      sameDomainConfirmed: formData.get("sameDomainConfirmed") === "true",
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
    return { status: "failed", problem: result.problem };
  }

  // Рядок список оновить сам, а от лічильники вкладок рендерить сервер:
  // компанія без джерел переїжджає між Tracked і Not tracked.
  revalidatePath("/companies");

  return { status: "saved", company: result.company };
}
