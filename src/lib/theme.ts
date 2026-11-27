/**
 * The UI appearance: what the user chose, not what is on the screen right now.
 *
 * `system` is not a third theme but a refusal to choose: then the operating
 * system sets the theme, and it may change while the app is running.
 */
export const THEME_PREFERENCES = ["light", "dark", "system"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/**
 * Until the user chooses, the theme comes from the system.
 */
export const DEFAULT_THEME: ThemePreference = "system";

/**
 * The name of the cookie with the chosen appearance.
 *
 * A cookie, not the `settings` table: the server reads it in `layout.tsx` and sets
 * `data-theme` already in the SSR HTML, so an explicit choice does not flash on
 * load. A database query on every layout render would not prevent the flash anyway.
 * Besides, the theme is more a property of the device (dark on the phone, light on
 * the monitor) than of the account. The same pattern as the language
 * (`src/i18n/config.ts`).
 */
export const THEME_COOKIE_NAME = "theme";

/**
 * The chosen appearance from an untrusted value.
 *
 * The cookie comes from the client and may hold anything: an unknown value means
 * "the user has not chosen", not an error. The same rule as in
 * `isSupportedLocale` and `parseCompaniesTab`.
 */
export function parseThemePreference(value: unknown): ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference)
    ? (value as ThemePreference)
    : DEFAULT_THEME;
}
