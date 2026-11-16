import type { careerSources } from "../db/schema.ts";
import { companyUrlHost } from "./url.ts";

/** Платформа карʼєрного джерела так, як її зберігає база. */
export type CareerPlatform = (typeof careerSources.$inferInsert)["platform"];

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
 */
const PLATFORM_DOMAINS: Array<[suffix: string, platform: CareerPlatform]> = [
  ["greenhouse.io", "greenhouse"],
  ["lever.co", "lever"],
  ["ashbyhq.com", "ashby"],
  ["myworkdayjobs.com", "workday"],
  ["myworkdaysite.com", "workday"],
  ["peopleforce.io", "peopleforce"],
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
  const host = companyUrlHost(normalizedUrl);

  const match = PLATFORM_DOMAINS.find(
    // Порівнюється межа лейбла домену, а не кінець рядка: інакше
    // `not-greenhouse.io` вважався б дошкою Greenhouse.
    ([suffix]) => host === suffix || host.endsWith(`.${suffix}`),
  );

  return match ? match[1] : "unsupported";
}
