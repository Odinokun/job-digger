"use client";

import { useFormatter, useNow, useTranslations } from "next-intl";

/** How often to recompute "5 min ago": the text needs no precision finer than a minute. */
const UPDATE_INTERVAL_MS = 60_000;

/**
 * "Last checked: 5 min ago" on a company card.
 *
 * `useNow` takes the shared "now" from the next-intl config (`src/i18n/request.ts`),
 * so the server and client renders match, and then updates once a minute so the
 * caption does not freeze on an open page
 * (https://next-intl.dev/docs/usage/dates-times#relative-times-update).
 */
export function LastChecked({
  at,
  message = "lastChecked",
}: {
  at: Date;
  /**
   * The caption: "Last checked" on the card or "Last ok" next to a failed
   * source - the same relative time.
   */
  message?: "lastChecked" | "lastOk";
}) {
  const t = useTranslations("CompaniesPage");
  const format = useFormatter();
  const now = useNow({ updateInterval: UPDATE_INTERVAL_MS });

  // A company just checked may have an `at` slightly later than `now`, which
  // updates once a minute - that would read "in 2 sec". There is no future here,
  // so the check time is capped at the present.
  const shown = at > now ? now : at;

  return (
    <span className="text-hint text-muted">
      {t(message, { time: format.relativeTime(shown, now) })}
    </span>
  );
}
