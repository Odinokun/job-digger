/**
 * The BambooHR parser: vacancies from the public JSON of the career page
 * `https://{company}.bamboohr.com/careers/list` (task 6.26).
 *
 * The documented BambooHR API needs a company key. This JSON is what the career
 * page itself and the embedded widget use; the format was checked with real
 * requests on 20.11.2026: no key, `{ meta: { totalCount }, result: [...] }`, all
 * vacancies in one request. An unknown company is not a 404 but a redirect to
 * the BambooHR site.
 */
import type { HttpClient } from "../http/client.ts";
import {
  collectVacancies,
  fetchText,
  isRecord,
  UNREADABLE,
  type ReadVacancy,
} from "./shared.ts";
import type { ParsedVacancy, ParseResult } from "./types.ts";

const DOMAIN = "bamboohr.com";

/** Subdomains of BambooHR itself, not of companies. */
const SERVICE_LABELS = new Set(["www", "api", "app", "help", "marketplace"]);

/**
 * The company from a career page or vacancy address
 * (`altenar.bamboohr.com/careers/88` → `altenar`), or `null`.
 */
export function bamboohrCompany(sourceUrl: string): string | null {
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

/**
 * Vacancies from the `/careers/list` response: the `result` array.
 *
 * `externalId` is `id`, the title is `jobOpeningName`. The JSON has no link -
 * the vacancy page is `/careers/{id}` (answers 200, checked). The location is
 * `location` (city, region), and if it is empty, `atsLocation`. The
 * `locationType` field ("0", "1") is undocumented, so we do not make up a
 * "remote" from it.
 */
export function parseBambooHrList(
  answer: unknown,
  company: string,
): ParseResult {
  if (!isRecord(answer) || !Array.isArray(answer.result)) {
    return UNREADABLE;
  }

  return collectVacancies(answer.result, vacancyOf(company));
}

function vacancyOf(company: string): ReadVacancy {
  return (job) => {
    const { id, jobOpeningName } = job;

    if (
      typeof id !== "string" ||
      id.trim() === "" ||
      typeof jobOpeningName !== "string"
    ) {
      return "broken";
    }

    if (jobOpeningName.trim() === "") {
      return "skip";
    }

    const vacancy: ParsedVacancy = {
      externalId: id,
      title: jobOpeningName.trim(),
      url: `https://${company}.${DOMAIN}/careers/${encodeURIComponent(id)}`,
      location: placeOf(job.location) ?? placeOf(job.atsLocation),
    };

    return vacancy;
  };
}

function placeOf(location: unknown): string | null {
  if (!isRecord(location)) {
    return null;
  }

  const parts = [
    location.city,
    location.state,
    location.province,
    location.country,
  ]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part !== "");

  return parts.length === 0 ? null : parts.join(", ");
}

/**
 * Vacancies of a career source on BambooHR: the company from the address, a
 * `/careers/list` request and parsing. BambooHR redirects an unknown company to
 * its own site - that is `not-found`, not `unreadable`. An address without a
 * company is `unreadable` without any request.
 */
export async function readBambooHr(
  sourceUrl: string,
  client: HttpClient,
): Promise<ParseResult> {
  const company = bamboohrCompany(sourceUrl);

  if (company === null) {
    return UNREADABLE;
  }

  const host = `${company}.${DOMAIN}`;
  const page = await fetchText(client, `https://${host}/careers/list`);

  if (!page.ok) {
    return page;
  }

  if (new URL(page.url).hostname.toLowerCase() !== host) {
    return { ok: false, error: { reason: "not-found" } };
  }

  let answer: unknown;
  try {
    answer = JSON.parse(page.body);
  } catch {
    return UNREADABLE;
  }

  return parseBambooHrList(answer, company);
}
