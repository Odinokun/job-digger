/**
 * The Breezy HR parser: vacancies from a board's public JSON
 * `https://{company}.breezy.hr/json` (task 3.24).
 *
 * This JSON has no official documentation - only third-party scrapers describe
 * it. The format was checked with real requests on 19.11.2026: no key, an array
 * of vacancies in one request, no pages; an unknown board is a 404.
 */
import type { HttpClient } from "../http/client.ts";
import {
  collectVacancies,
  fetchJson,
  isRecord,
  isWebUrl,
  UNREADABLE,
  type ReadVacancy,
} from "./shared.ts";
import type { ParseResult } from "./types.ts";

const DOMAIN = "breezy.hr";

/**
 * Subdomains of Breezy itself, not of companies: the embedded board's scripts and
 * styles (`assets-cdn`), the recruiter app (`app`) and the site (`www`). `jobs` is
 * Breezy's own board, so it is a company like any other.
 */
const SERVICE_LABELS = new Set(["www", "app", "assets-cdn"]);

/**
 * The company from a board or vacancy address (`acme.breezy.hr/p/...` → `acme`),
 * or `null` if it is not a Breezy board.
 */
export function breezyCompany(sourceUrl: string): string | null {
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
 * Vacancies from the `/json` response: an array of vacancies.
 *
 * `externalId` is the `id` field (the same as at the start of the `/p/{id}-{slug}`
 * path), the title is `name`, the link is `url`, the location is
 * `location.name`, with a "remote" note for a remote vacancy (`location.is_remote`).
 */
export function parseBreezyPositions(answer: unknown): ParseResult {
  if (!Array.isArray(answer)) {
    return UNREADABLE;
  }

  return collectVacancies(answer, toVacancy);
}

const toVacancy: ReadVacancy = (position) => {
  const { id, name, url, location } = position;

  if (
    typeof id !== "string" ||
    id.trim() === "" ||
    typeof name !== "string" ||
    typeof url !== "string"
  ) {
    return "broken";
  }

  if (name.trim() === "" || !isWebUrl(url)) {
    return "skip";
  }

  return {
    externalId: id,
    title: name.trim(),
    url,
    location: placeOf(location),
  };
};

function placeOf(location: unknown): string | null {
  if (!isRecord(location)) {
    return null;
  }

  const name = typeof location.name === "string" ? location.name.trim() : "";
  const remote = location.is_remote === true;

  if (name === "") {
    return remote ? "remote" : null;
  }

  return remote ? `${name}, remote` : name;
}

/**
 * Vacancies of a career source on Breezy HR: the company from the address, a
 * `/json` request through the HTTP client and parsing. An address without a
 * Breezy board is `unreadable` without any request.
 */
export async function readBreezy(
  sourceUrl: string,
  client: HttpClient,
): Promise<ParseResult> {
  const company = breezyCompany(sourceUrl);

  if (company === null) {
    return UNREADABLE;
  }

  const fetched = await fetchJson(client, `https://${company}.${DOMAIN}/json`);

  return fetched.ok ? parseBreezyPositions(fetched.answer) : fetched;
}
