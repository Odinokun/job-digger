/**
 * Мови інтерфейсу. Коди - підтеги мови за BCP 47 (RFC 5646): "uk" - це
 * українська мова, а не країна; регіон ("uk-UA") не потрібен, бо варіантів
 * однієї мови в нас немає.
 */
export const locales = ["en", "uk"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** Імʼя cookie, у якій зберігається вибрана мова. */
export const localeCookieName = "locale";

export function isSupportedLocale(value: unknown): value is Locale {
  return locales.includes(value as Locale);
}
