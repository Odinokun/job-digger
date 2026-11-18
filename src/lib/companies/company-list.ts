import type { CareerPlatform } from "./platform";

/**
 * Типи й чиста логіка списку компаній.
 *
 * Лежать у `src/lib`, а не поруч із запитами в `src/server/companies/list.ts`,
 * бо список компаній - клієнтський компонент (накопичує порції Load more), а
 * серверні модулі в клієнт не імпортуються. Той самий хід, що з переліком
 * платформ у [`platform.ts`](./platform.ts).
 */

/**
 * Стани компанії на вкладці Not tracked (docs/ui.md, розділ 4.3).
 *
 * Перелік тут, а `pgEnum("discovery_status")` будується з нього: інакше ті самі
 * значення жили б у двох місцях і розходилися б.
 */
export const DISCOVERY_STATUSES = [
  "not_checked",
  "not_found",
  "unsupported",
  "check_failed",
] as const;

export type DiscoveryStatus = (typeof DISCOVERY_STATUSES)[number];

/** Вкладки сторінки Companies. */
export const COMPANIES_TABS = ["tracked", "not-tracked"] as const;

/**
 * Належність до вкладки в базі не зберігається: Tracked - це «є хоч одне
 * джерело, що відстежується» (docs/ui.md, розділи 4.2 і 4.3).
 */
export type CompaniesTab = (typeof COMPANIES_TABS)[number];

export type CompanySource = {
  id: string;
  url: string;
  /**
   * Підпис, яким користувач розрізняє джерела одного сайту, або `null`, якщо
   * підпису немає: адреса сама собою зрозуміла.
   */
  label: string | null;
  platform: CareerPlatform;
  isTracked: boolean;
};

export type CompanyListItem = {
  id: string;
  name: string;
  /**
   * Головний сайт або `null`: компанію, знайдену лише на ATS, вигадувати сайт
   * не змушуємо (картка 2.17). Тоді в картці показуються самі джерела.
   */
  url: string | null;
  discoveryStatus: DiscoveryStatus;
  sources: CompanySource[];
  /**
   * Вакансії всіх джерел компанії: скільки всього і скільки з них у Favorites.
   * Їх називає діалог видалення - разом із компанією зникають і вони.
   */
  vacancies: { total: number; favorites: number };
};

/**
 * Вкладка з недовіреного значення: параметра адреси або аргумента Server
 * Action.
 *
 * Усе невідоме - це Tracked, бо саме він відкривається за замовчуванням:
 * помилка в адресі має показати звичайний список, а не порожнечу чи помилку.
 */
export function parseCompaniesTab(value: unknown): CompaniesTab {
  return value === "not-tracked" ? "not-tracked" : "tracked";
}

/**
 * Порядок рядків списку: той самий, що задає запит (`order by name, id`).
 *
 * Потрібен на клієнті, коли перейменована компанія повертається з сервера й
 * має стати на своє місце серед уже показаних, не перечитуючи список.
 *
 * `localeCompare` збігається з порядком бази: вона створена з `en_US.utf8`, де
 * «acme» стоїть перед «Bosch», а не після нього, як було б при побайтовому
 * порівнянні. Ідентичність вичерпна лише доти, доки база лишається з цією
 * локаллю; точний порядок у будь-якому разі задає наступне читання з сервера.
 */
export function compareCompanyRows(
  left: CompanyListItem,
  right: CompanyListItem,
): number {
  const byName = left.name.localeCompare(right.name, "en");

  return byName === 0 ? left.id.localeCompare(right.id) : byName;
}
