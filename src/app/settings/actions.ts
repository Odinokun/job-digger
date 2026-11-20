"use server";

import { cookies } from "next/headers";

import { runAction } from "@/app/action-result";
import { revalidateHeaderCounts } from "@/app/components/header-counts";
import { isSupportedLocale, localeCookieName } from "@/i18n/config";
import {
  CSV_IMPORT_MAX_BYTES,
  type ImportCsvResult,
} from "@/lib/csv/import-result";
import { parseAutoCheckInterval } from "@/lib/settings/auto-check-interval";
import { parseThemePreference, THEME_COOKIE_NAME } from "@/lib/theme";
import { importCompanies } from "@/server/csv/import";
import { parseCompaniesCsv } from "@/server/csv/parse";
import { getDb } from "@/server/db/client";
import { getSystemUser } from "@/server/db/system-user";
import { setAutoCheckInterval } from "@/server/settings/settings";

/**
 * Рік: вибір оформлення чи мови не має протухати, доки користувач його не
 * змінить.
 */
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Запамʼятовує вибране оформлення.
 *
 * Сам вигляд сторінки міняє клієнт, ще до виклику: атрибут на `<html>`
 * ставиться одразу, тож перемикання не чекає на мережу. Ця дія потрібна лише
 * для того, щоб вибір пережив перезавантаження.
 *
 * Аргумент приходить із клієнта й нічим не захищений - Server Action доступний
 * прямим POST-запитом, а не лише через кнопку, - тому значення проходить
 * `parseThemePreference`: у cookie потрапляє одне з трьох відомих або
 * `system`.
 *
 * `httpOnly` не ставимо: cookie не секрет, а налаштування вигляду.
 */
export async function setThemeAction(preference: unknown): Promise<void> {
  const store = await cookies();

  store.set(THEME_COOKIE_NAME, parseThemePreference(preference), {
    path: "/",
    maxAge: THEME_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
}

/**
 * Запамʼятовує мову інтерфейсу в cookie, яку читає `i18n/request.ts`.
 *
 * Невідома мова не пишеться зовсім: `request.ts` однаково відкинув би її, а
 * cookie з мотлохом лише плутала б. Тексти сторінки оновлює клієнт -
 * `router.refresh()` після дії: переклади рендерить сервер.
 */
export async function setLocaleAction(locale: unknown): Promise<void> {
  if (!isSupportedLocale(locale)) {
    return;
  }

  const store = await cookies();

  store.set(localeCookieName, locale, {
    path: "/",
    maxAge: THEME_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
}

export type SetAutoCheckIntervalResult =
  { ok: true } | { ok: false; reason: "invalid" | "unexpected" };

/**
 * Запамʼятовує інтервал автоматичної перевірки (задача 6.01).
 *
 * Значення приходить із клієнта, тому проходить `parseAutoCheckInterval`:
 * хибне відхиляється, а не підміняється іншим інтервалом.
 */
export async function setAutoCheckIntervalAction(
  hours: unknown,
): Promise<SetAutoCheckIntervalResult> {
  const interval = parseAutoCheckInterval(hours);

  if (interval === null) {
    return { ok: false, reason: "invalid" };
  }

  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    await setAutoCheckInterval(db, user.id, interval);
  });

  return outcome.ok ? { ok: true } : { ok: false, reason: "unexpected" };
}

/**
 * Import CSV (задача 6.06): файл із форми → компанії й джерела, з підсумком.
 *
 * Файл приходить із клієнта, тому розмір і кодування перевіряються й тут,
 * хоч сторінка перевіряє розмір ще до відправлення. Відмова за заголовком
 * відхиляє файл цілком - у базу не пишеться нічого.
 */
export async function importCsvAction(
  _previous: ImportCsvResult | null,
  formData: FormData,
): Promise<ImportCsvResult> {
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { status: "refused", reason: "no-file" };
  }

  if (file.size > CSV_IMPORT_MAX_BYTES) {
    return { status: "refused", reason: "too-large" };
  }

  let text: string;

  try {
    // `fatal`: не-UTF-8 файл - відмова, а не мовчазні знаки заміни в назвах.
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer(),
    );
  } catch {
    return { status: "refused", reason: "encoding" };
  }

  const parsed = parseCompaniesCsv(text);

  if (!parsed.ok) {
    return { status: "refused", reason: "header" };
  }

  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    return importCompanies(db, { userId: user.id, rows: parsed.rows });
  });

  if (!outcome.ok) {
    return { status: "failed-unexpectedly" };
  }

  // Нові компанії - у вкладках Companies і, можливо, в лічильнику уваги.
  revalidateHeaderCounts();

  return {
    status: "imported",
    ...outcome.value,
    // Рядки, які не вдалося навіть розібрати, - теж помилки.
    errors: outcome.value.errors + parsed.malformed,
  };
}
