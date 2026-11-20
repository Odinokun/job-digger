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
  // Знайдено дошку лише за назвою, і вона не веде на сайт компанії: Find new
  // pages її не додає, а користувач підтверджує через Find pages (задача 5.10).
  "possible_page",
] as const;

export type DiscoveryStatus = (typeof DISCOVERY_STATUSES)[number];

/**
 * Вкладки сторінки Companies. `attention` - Needs attention (задача 6.11): зріз
 * поверх двох інших, компанія з неї лишається й у своїй Tracked чи Not tracked.
 */
export const COMPANIES_TABS = ["tracked", "not-tracked", "attention"] as const;

/**
 * Належність до вкладки в базі не зберігається: Tracked - це «є хоч одне
 * джерело, що відстежується» (docs/ui.md, розділи 4.2 і 4.3), Needs attention -
 * правило в `src/server/companies/list.ts` (`needsAttentionSubquery`).
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
  /**
   * Сторінку, яку нічим прочитати, людина позначила «лише посиланням»
   * (задача 6.17): вона не рахується непрочитаною.
   */
  isReferenceOnly: boolean;
  /**
   * Чим закінчилася остання перевірка джерела: `null` - ще не перевірялося.
   * Невдала - це `consecutive_failures > 0`.
   */
  lastCheck: "ok" | "failed" | null;
  /**
   * Остання успішна перевірка - «Last ok: 12 days ago» біля невдалого джерела:
   * після збою вакансії не видаляються, і без цієї дати застарілі не відрізнити
   * від живих (docs/ui.md, розділ 4.2).
   */
  lastSuccessAt: Date | null;
  /** Джерело в черзі: завдання чекає або виконується. */
  isChecking: boolean;
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
  /**
   * Остання перевірка серед джерел компанії, успішна чи ні, або `null`, якщо
   * жодне ще не перевірялося. Картка показує її відносно («Last checked: 5 min
   * ago», docs/ui.md, розділ 4.2).
   */
  lastCheckedAt: Date | null;
};

/**
 * Вкладка з недовіреного значення: параметра адреси або аргумента Server
 * Action.
 *
 * Усе невідоме - це Tracked, бо саме він відкривається за замовчуванням:
 * помилка в адресі має показати звичайний список, а не порожнечу чи помилку.
 */
export function parseCompaniesTab(value: unknown): CompaniesTab {
  return value === "not-tracked" || value === "attention" ? value : "tracked";
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

/**
 * Компанія відстежується, якщо хоч одне її джерело відстежується - те саме
 * правило, що ділить вкладки Tracked і Not tracked. Потрібне на вкладці Needs
 * attention, де змішані обидві: дії картки визначає компанія, а не вкладка.
 */
export function isTrackedCompany(sources: CompanySource[]): boolean {
  return sources.some((source) => source.isTracked);
}

/**
 * Сторінка, яку ми не читаємо і яку людина не позначила «лише посиланням»
 * (задачі 6.11 і 6.17). Те саме правило для бази - `needsAttentionSubquery` у
 * `src/server/companies/list.ts`.
 */
export function isNotReadSource(source: CompanySource): boolean {
  return source.platform === "unsupported" && !source.isReferenceOnly;
}

/**
 * Скільки сторінок компанії ми не читаємо - бейдж «N pages not read» (задача
 * 6.11). Unsupported - постійний стан, а не збій, тому це окремий бейдж уваги,
 * а не Has errors.
 */
export function notReadSourceCount(sources: CompanySource[]): number {
  return sources.filter(isNotReadSource).length;
}
