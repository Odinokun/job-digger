/**
 * Оформлення інтерфейсу: що користувач вибрав, а не що зараз видно на екрані.
 *
 * `system` - не третя тема, а відмова вибирати: тоді тему задає операційна
 * система, і вона може змінитися під час роботи застосунку.
 */
export const THEME_PREFERENCES = ["light", "dark", "system"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/**
 * Доки користувач не вибрав - беремо тему з системи (docs/ui.md, розділ 4.5).
 */
export const DEFAULT_THEME: ThemePreference = "system";

/**
 * Імʼя cookie з вибраним оформленням.
 *
 * Cookie, а не таблиця `settings`: сервер читає її в `layout.tsx` і ставить
 * `data-theme` уже в SSR-HTML, тож явний вибір не мигає при завантаженні.
 * Запит у базу на кожен рендер layout від спалаху однаково не врятував би. До
 * того ж тема - радше властивість пристрою (на телефоні темна, на моніторі
 * світла), ніж акаунта. Той самий патерн, що в мови (`src/i18n/config.ts`).
 */
export const THEME_COOKIE_NAME = "theme";

/**
 * Вибране оформлення з недовіреного значення.
 *
 * Cookie приходить від клієнта, і в ній може лежати будь-що: невідоме значення
 * означає «користувач не вибирав», а не помилку. Те саме правило, що в
 * `isSupportedLocale` і `parseCompaniesTab`.
 */
export function parseThemePreference(value: unknown): ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference)
    ? (value as ThemePreference)
    : DEFAULT_THEME;
}
