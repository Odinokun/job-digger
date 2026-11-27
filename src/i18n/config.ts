/**
 * UI languages. The codes are BCP 47 (RFC 5646) language subtags: "uk" is the
 * Ukrainian language, not a country; a region ("uk-UA") is not needed, because we
 * have no variants of one language.
 */
export const locales = ["en", "uk"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** The name of the cookie that stores the chosen language. */
export const localeCookieName = "locale";

export function isSupportedLocale(value: unknown): value is Locale {
  return locales.includes(value as Locale);
}
