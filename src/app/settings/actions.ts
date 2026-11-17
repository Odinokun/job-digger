"use server";

import { cookies } from "next/headers";

import { parseThemePreference, THEME_COOKIE_NAME } from "@/lib/theme";

/** Рік: вибір оформлення не має протухати, доки користувач його не змінить. */
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
