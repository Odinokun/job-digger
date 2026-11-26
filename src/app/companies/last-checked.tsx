"use client";

import { useFormatter, useNow, useTranslations } from "next-intl";

/** Як часто перераховувати «5 min ago»: точніше за хвилину тексту не треба. */
const UPDATE_INTERVAL_MS = 60_000;

/**
 * «Last checked: 5 min ago» у картці компанії.
 *
 * `useNow` бере спільне «зараз» із конфігурації next-intl (`src/i18n/request.ts`),
 * тож серверний і клієнтський рендер збігаються, а далі оновлюється раз на
 * хвилину, щоб підпис не застигав на відкритій сторінці
 * (https://next-intl.dev/docs/usage/dates-times#relative-times-update).
 */
export function LastChecked({
  at,
  message = "lastChecked",
}: {
  at: Date;
  /**
   * Підпис: «Last checked» картки або «Last ok» біля невдалого джерела - той
   * самий відносний час.
   */
  message?: "lastChecked" | "lastOk";
}) {
  const t = useTranslations("CompaniesPage");
  const format = useFormatter();
  const now = useNow({ updateInterval: UPDATE_INTERVAL_MS });

  // Щойно перевірена компанія може мати `at` трохи пізніше за `now`, яке
  // оновлюється раз на хвилину, - тоді вийшло б «in 2 sec». Майбутнього тут
  // не буває, тож час перевірки обмежується теперішнім.
  const shown = at > now ? now : at;

  return (
    <span className="text-hint text-muted">
      {t(message, { time: format.relativeTime(shown, now) })}
    </span>
  );
}
