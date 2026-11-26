/**
 * The Hurma parser: vacancies from the API used by the public page
 * `https://{company}.hurma.work/public-vacancies` (task 3.26).
 *
 * Neither the page nor the API has documentation. The page is an SPA with no
 * vacancies in its HTML: it takes them from `GET /api/v1/public-vacancies` (as
 * its JavaScript shows). The format was checked with real requests on
 * 19.11.2026: no key, pages of up to 100 vacancies, but only with the
 * `X-Requested-With: XMLHttpRequest` header - without it, a 403 with any User-Agent.
 */
import type { HttpClient } from "../http/client.ts";
import { pagesToRead, type ReadDepth } from "./vacancies-to-check.ts";
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

/** The largest page the API accepts: `per_page=1000` gives a 422. */
export const HURMA_PAGE_SIZE = 100;

/**
 * Without this header the API answers 403. It is Laravel's "request from the
 * page's JavaScript" marker, not bot protection: a browser User-Agent without it
 * gets a 403 too. The author's decision of 19.11.2026: send it, the UA stays honest.
 */
const API_HEADERS = { "X-Requested-With": "XMLHttpRequest" };

/** Subdomains of Hurma itself, not of companies: the site, training and help. */
const SERVICE_LABELS = new Set(["www", "academy", "support"]);

/**
 * The company from a board or vacancy address (`acme.hurma.work/public-vacancies/7`
 * → `acme`), or `null` if it is not a Hurma board.
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

/** The address of the company's public vacancies page. */
export function hurmaBoardUrl(company: string): string {
  return `https://${company}.${DOMAIN}/public-vacancies`;
}

/**
 * Vacancies of one API page: `{ data: [...], links, meta }`.
 *
 * `externalId` is the number at the end of `public_url` (`/public-vacancies/{id}`),
 * there is no separate ID field; the title is `name`, the link is `public_url`,
 * the location is `residence` (places separated by "|" become ", ") followed by
 * `work_format` ("Remote").
 */
export function parseHurmaVacancies(answer: unknown): ParseResult {
  if (!isRecord(answer) || !Array.isArray(answer.data)) {
    return UNREADABLE;
  }

  return collectVacancies(answer.data, toVacancy);
}

/** Whether there is another page after this one: the `links.next` link. */
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
 * Vacancies of a career source on Hurma: the company from the address, API pages
 * of `HURMA_PAGE_SIZE` up to `maxPages` through the HTTP client and parsing. An
 * address without a Hurma board is `unreadable` without any request.
 */
export async function readHurma(
  sourceUrl: string,
  client: HttpClient,
  {
    depth = "full",
    maxPages = pagesToRead({ pageSize: HURMA_PAGE_SIZE, depth }),
  }: { depth?: ReadDepth; maxPages?: number } = {},
): Promise<ParseResult> {
  const company = hurmaCompany(sourceUrl);

  if (company === null) {
    return UNREADABLE;
  }

  const base = `https://${company}.${DOMAIN}/api/v1/public-vacancies`;
  const vacancies: ParsedVacancy[] = [];
  let skipped = 0;
  // Becomes `false` only when the list ended by itself, not at the limit.
  let truncated = true;

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
      truncated = false;
      break;
    }
  }

  return truncated
    ? { ok: true, vacancies, skipped, truncated: true }
    : { ok: true, vacancies, skipped };
}
