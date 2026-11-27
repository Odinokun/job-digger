/**
 * The auto-check interval in hours.
 *
 * The list lives here, not in the database schema: the Settings page shows it, and
 * the `CHECK` on the `settings.auto_check_interval_hours` column is built from it too.
 */
export const AUTO_CHECK_INTERVALS = [3, 6, 12, 24] as const;

export type AutoCheckInterval = (typeof AUTO_CHECK_INTERVALS)[number];

/** Until the user chooses. */
export const DEFAULT_AUTO_CHECK_INTERVAL: AutoCheckInterval = 6;

/**
 * The interval from an untrusted value - a Server Action argument or a form field.
 *
 * `null`, not the default: unlike the theme, this value is saved to the database,
 * and a wrong request has to be rejected rather than silently turned into another
 * choice.
 */
export function parseAutoCheckInterval(
  value: unknown,
): AutoCheckInterval | null {
  const hours =
    typeof value === "string" && value !== "" ? Number(value) : value;

  return AUTO_CHECK_INTERVALS.includes(hours as AutoCheckInterval)
    ? (hours as AutoCheckInterval)
    : null;
}
