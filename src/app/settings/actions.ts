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
 * A year: a theme or language choice should not expire until the user changes
 * it.
 */
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Remembers the chosen theme.
 *
 * The client changes the look of the page itself, before the call: the
 * attribute on `<html>` is set at once, so switching does not wait for the
 * network. This action is needed only so the choice survives a reload.
 *
 * The argument comes from the client and is not protected by anything - a
 * Server Action can be reached with a direct POST request, not only through the
 * button - so the value goes through `parseThemePreference`: the cookie gets one
 * of the three known values or `system`.
 *
 * No `httpOnly`: the cookie is not a secret, just a display setting.
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
 * Remembers the UI language in the cookie that `i18n/request.ts` reads.
 *
 * An unknown language is not written at all: `request.ts` would reject it
 * anyway, and a cookie with junk would only confuse. The client refreshes the
 * page texts - `router.refresh()` after the action: the server renders the
 * translations.
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
 * Remembers the auto-check interval (task 6.01).
 *
 * The value comes from the client, so it goes through `parseAutoCheckInterval`:
 * an invalid one is refused, not replaced with another interval.
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
 * Import CSV (task 6.06): the file from the form → companies and sources, with
 * a summary.
 *
 * The file comes from the client, so its size and encoding are checked here
 * too, although the page checks the size before sending. A refusal over the
 * header rejects the whole file - nothing is written to the database.
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
    // `fatal`: a non-UTF-8 file is a refusal, not silent replacement characters in names.
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

  // New companies - in the Companies tabs and possibly in the attention counter.
  revalidateHeaderCounts();

  return {
    status: "imported",
    ...outcome.value,
    // Rows that could not even be parsed are errors too.
    errors: outcome.value.errors + parsed.malformed,
  };
}
