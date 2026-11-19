/**
 * Парсер Hurma: вакансії з API, яким користується публічна сторінка
 * `https://{company}.hurma.work/public-vacancies` (задача 3.26).
 *
 * Документації ні в сторінки, ні в API немає. Сторінка - SPA, вакансій у HTML
 * немає: вона бере їх з `GET /api/v1/public-vacancies` (видно з її JavaScript).
 * Формат перевірено справжніми запитами 19.11.2026: без ключа, сторінками до
 * 100 вакансій, але лише з заголовком `X-Requested-With: XMLHttpRequest` - без
 * нього 403 з будь-яким User-Agent.
 */
import type { HttpClient } from "../http/client.ts";
import { PAGES_TO_CHECK } from "./pages-to-check.ts";
import {
  collectVacancies,
  fetchJson,
  isRecord,
  isWebUrl,
  UNREADABLE,
  type ReadVacancy,
} from "./shared.ts";
import type { ParsedVacancy, ParseResult } from "./types.ts";

const DOMAIN = "hurma.work";

/** Найбільша сторінка, яку приймає API: `per_page=1000` - 422. */
export const HURMA_PAGE_SIZE = 100;

/**
 * Без цього заголовка API відповідає 403. Це позначка Laravel «запит від
 * JavaScript сторінки», а не захист від ботів: браузерний User-Agent без неї теж
 * дає 403. Рішення автора 19.11.2026 - слати, UA лишається чесним.
 */
const API_HEADERS = { "X-Requested-With": "XMLHttpRequest" };

/** Піддомени самої Hurma, а не компаній: сайт, навчання й довідка. */
const SERVICE_LABELS = new Set(["www", "academy", "support"]);

/**
 * Компанія з адреси дошки чи вакансії (`acme.hurma.work/public-vacancies/7` →
 * `acme`) або `null`, якщо це не дошка Hurma.
 */
export function hurmaCompany(sourceUrl: string): string | null {
  let host: string;

  try {
    host = new URL(sourceUrl).hostname.toLowerCase();
  } catch {
    return null;
  }

  if (!host.endsWith(`.${DOMAIN}`)) {
    return null;
  }

  const company = host.slice(0, -DOMAIN.length - 1);

  return company.includes(".") || SERVICE_LABELS.has(company) ? null : company;
}

/** Адреса публічної сторінки вакансій компанії. */
export function hurmaBoardUrl(company: string): string {
  return `https://${company}.${DOMAIN}/public-vacancies`;
}

/**
 * Вакансії однієї сторінки API: `{ data: [...], links, meta }`.
 *
 * `externalId` - число в кінці `public_url` (`/public-vacancies/{id}`), окремого
 * поля ID немає; назва - `name`, посилання - `public_url`, локація - `residence`
 * (місця через «|» стають «, ») і за ним `work_format` («Remote»).
 */
export function parseHurmaVacancies(answer: unknown): ParseResult {
  if (!isRecord(answer) || !Array.isArray(answer.data)) {
    return UNREADABLE;
  }

  return collectVacancies(answer.data, toVacancy);
}

/** Чи є після цієї сторінки ще одна: посилання `links.next`. */
export function hurmaHasNextPage(answer: unknown): boolean {
  return (
    isRecord(answer) &&
    isRecord(answer.links) &&
    typeof answer.links.next === "string"
  );
}

const VACANCY_ID = /\/public-vacancies\/(\d+)\/?$/;

const toVacancy: ReadVacancy = (vacancy) => {
  const { name, public_url: url, residence, work_format: format } = vacancy;

  if (typeof name !== "string" || typeof url !== "string") {
    return "broken";
  }

  if (name.trim() === "" || !isWebUrl(url)) {
    return "skip";
  }

  const id = VACANCY_ID.exec(new URL(url).pathname)?.[1];

  if (id === undefined) {
    return "broken";
  }

  return {
    externalId: id,
    title: name.trim(),
    url,
    location: placeOf(residence, format),
  };
};

function placeOf(residence: unknown, format: unknown): string | null {
  const parts = [
    ...(typeof residence === "string" ? residence.split("|") : []),
    typeof format === "string" ? format : "",
  ]
    .map((part) => part.trim())
    .filter((part) => part !== "");

  return parts.length === 0 ? null : parts.join(", ");
}

/**
 * Вакансії кар'єрного джерела на Hurma: компанія з адреси, сторінки API по
 * `HURMA_PAGE_SIZE` до `maxPages` через HTTP-клієнт і розбір. Адреса без дошки
 * Hurma - `unreadable` без жодного запиту.
 */
export async function readHurma(
  sourceUrl: string,
  client: HttpClient,
  { maxPages = PAGES_TO_CHECK }: { maxPages?: number } = {},
): Promise<ParseResult> {
  const company = hurmaCompany(sourceUrl);

  if (company === null) {
    return UNREADABLE;
  }

  const base = `https://${company}.${DOMAIN}/api/v1/public-vacancies`;
  const vacancies: ParsedVacancy[] = [];
  let skipped = 0;

  for (let page = 1; page <= maxPages; page += 1) {
    const fetched = await fetchJson(
      client,
      `${base}?per_page=${HURMA_PAGE_SIZE}&page=${page}`,
      { headers: API_HEADERS },
    );

    if (!fetched.ok) {
      return fetched;
    }

    const parsed = parseHurmaVacancies(fetched.answer);

    if (!parsed.ok) {
      return parsed;
    }

    vacancies.push(...parsed.vacancies);
    skipped += parsed.skipped;

    if (!hurmaHasNextPage(fetched.answer)) {
      break;
    }
  }

  return { ok: true, vacancies, skipped };
}
