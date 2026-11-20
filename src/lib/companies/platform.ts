import { companyUrlHost } from "./url.ts";

/**
 * Платформи карʼєрних джерел: за платформою вибирається парсер.
 *
 * Перелік живе тут, а не в схемі бази, бо потрібен і на клієнті, а зі схеми
 * тягнувся б разом із Drizzle. Enum `career_platform` будується з цього
 * масиву - значення й порядок у базі й у коді не можуть розійтися.
 *
 * `own_page` - власна кар'єрна сторінка компанії, яку читаємо за рецептом
 * (задача 6.21): людина підтвердила, які посилання на ній - вакансії. За
 * адресою її не розпізнати, тож `detectPlatform` її ніколи не повертає.
 *
 * `unsupported` - сторінку знайдено, але читати її нічим
 * (docs/discovery-and-parsing.md, розділ 6).
 */
export const CAREER_PLATFORMS = [
  "greenhouse",
  "lever",
  "ashby",
  "workday",
  "peopleforce",
  "breezy",
  "cleverstaff",
  "hurma",
  "personio",
  "softgarden",
  "schema_org",
  "own_page",
  "unsupported",
] as const;

/** Платформа карʼєрного джерела так, як її зберігає база. */
export type CareerPlatform = (typeof CAREER_PLATFORMS)[number];

/**
 * Домени платформ. Ключ - суфікс хоста, значення - платформа.
 *
 * Перелік свідомо короткий: тут лише ті хости, які видає сама платформа.
 * Кастомний домен клієнта ATS (`jobs.company.com`) сюди не потрапляє -
 * адреса про нього нічого не каже.
 *
 * - `greenhouse.io` - офіційна документація описує `boards.greenhouse.io`
 *   (support.greenhouse.io/hc/en-us/articles/360020776251); новіший
 *   `job-boards.greenhouse.io` офіційно не описаний, але віддає ті самі дошки,
 *   тому суфікс покриває обидва.
 * - `lever.co` - публічний Postings API Lever працює з хостами `jobs.lever.co`
 *   і `jobs.eu.lever.co` (github.com/lever/postings-api).
 * - `myworkdayjobs.com` і `myworkdaysite.com` - два формати career site Workday.
 * - `peopleforce.io` - карʼєрний сайт PeopleForce живе на власному субдомені.
 * - `breezy.hr` - дошка Breezy HR теж на субдомені компанії (задача 3.24).
 * - `cleverstaff.net` - дошка CleverStaff на хості самої платформи,
 *   `cleverstaff.net/i/{alias}-vacancies` (задача 3.25).
 * - `hurma.work` - публічна сторінка вакансій Hurma на субдомені компанії,
 *   `{company}.hurma.work/public-vacancies` (задача 3.26).
 * - `jobs.personio.de` і `jobs.personio.com` - дошка Personio на субдомені
 *   компанії (developer.personio.de/docs/retrieving-open-job-positions; `.com`
 *   віддає те саме - задача 3.27). Сам `personio.de`/`.com` - сайт постачальника.
 * - `softgarden.io` (стара дошка) і `career.softgarden.de` (новий кар'єрний
 *   сайт) - два продукти softgarden, обидва на субдомені компанії (задача 3.28).
 *   Решта `softgarden.de` (`static.`, сайт) - не дошки.
 */
const PLATFORM_DOMAINS: Array<[suffix: string, platform: CareerPlatform]> = [
  ["greenhouse.io", "greenhouse"],
  ["lever.co", "lever"],
  ["ashbyhq.com", "ashby"],
  ["myworkdayjobs.com", "workday"],
  ["myworkdaysite.com", "workday"],
  ["peopleforce.io", "peopleforce"],
  ["breezy.hr", "breezy"],
  ["cleverstaff.net", "cleverstaff"],
  ["hurma.work", "hurma"],
  ["jobs.personio.de", "personio"],
  ["jobs.personio.com", "personio"],
  ["softgarden.io", "softgarden"],
  ["career.softgarden.de", "softgarden"],
];

/**
 * Платформа джерела, виведена з його адреси.
 *
 * Приймає **очищену** адресу - ту саму форму, яку віддає `normalizeCompanyUrl`
 * (без протоколу, хост у нижньому регістрі). Тому тут немає ні розбору URL, ні
 * обробки кривого вводу: валідація сталася кроком раніше.
 *
 * Невідомий хост - це `unsupported`: доки сторінку не прочитали пробним
 * запитом, вважати її придатною нема підстав. `schema_org` функція не
 * повертає ніколи - розмітку JobPosting видно лише з вмісту сторінки.
 */
export function detectPlatform(normalizedUrl: string): CareerPlatform {
  return matchPlatformDomain(normalizedUrl)?.[1] ?? "unsupported";
}

/**
 * Суфікс хоста, за яким платформу впізнали, або `null` для невідомого хоста.
 *
 * Потрібен там, де з адреси треба дістати частину, яку додала сама платформа:
 * у `bosch.wd3.myworkdayjobs.com` суфікс - `myworkdayjobs.com`, і все перед ним
 * належить компанії (`suggest.ts`).
 */
export function platformHostSuffix(normalizedUrl: string): string | null {
  return matchPlatformDomain(normalizedUrl)?.[0] ?? null;
}

/** Рядок `PLATFORM_DOMAINS`, під який підпадає хост адреси. */
function matchPlatformDomain(
  normalizedUrl: string,
): (typeof PLATFORM_DOMAINS)[number] | undefined {
  const host = companyUrlHost(normalizedUrl);

  return PLATFORM_DOMAINS.find(
    // Порівнюється межа лейбла домену, а не кінець рядка: інакше
    // `not-greenhouse.io` вважався б дошкою Greenhouse.
    ([suffix]) => host === suffix || host.endsWith(`.${suffix}`),
  );
}
