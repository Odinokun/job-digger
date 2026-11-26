/**
 * The Pinpoint parser: vacancies from the public JSON of the career page
 * `https://{company}.pinpointhq.com/postings.json` (task 6.27).
 *
 * We found no documentation for this JSON; the format was checked with real
 * requests on 20.11.2026: no key, `{ data: [...] }`, all vacancies in one
 * request, together with full descriptions (100 KB for 16 vacancies at GiG), an
 * unknown company is a 404.
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

const DOMAIN = "pinpointhq.com";

/** Subdomains of Pinpoint itself: the site, the app and files (`app.pinpointhq.com`). */
const SERVICE_LABELS = new Set(["www", "app", "api", "help", "developers"]);

/**
 * The company from a career page or vacancy address
 * (`gig.pinpointhq.com/en/postings/…` → `gig`), or `null`.
 */
export function pinpointCompany(sourceUrl: string): string | null {
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
 * Vacancies from the `postings.json` response: the `data` array.
 *
 * `externalId` is `id`, the title is `title`, the link is `url`. The location is
 * the city and region (`location.city`, `location.province`) without repeats,
 * with a "remote" note for `workplace_type: "remote"`. One position in several
 * cities is several vacancies with different `id`s, as on the Pinpoint page.
 */
export function parsePinpointPostings(answer: unknown): ParseResult {
  if (!isRecord(answer) || !Array.isArray(answer.data)) {
    return UNREADABLE;
  }

  return collectVacancies(answer.data, toVacancy);
}

const toVacancy: ReadVacancy = (posting) => {
  const { id, title, url } = posting;

  if (
    typeof id !== "string" ||
    id.trim() === "" ||
    typeof title !== "string" ||
    typeof url !== "string"
  ) {
    return "broken";
  }

  if (title.trim() === "" || !isWebUrl(url)) {
    return "skip";
  }

  return {
    externalId: id,
    title: title.trim(),
    url,
    location: placeOf(posting),
  };
};

function placeOf(posting: Record<string, unknown>): string | null {
  const location = isRecord(posting.location) ? posting.location : {};
  const parts: string[] = [];

  for (const part of [location.city, location.province]) {
    const text = typeof part === "string" ? part.trim() : "";
    const seen = parts.some(
      (known) => known.toLowerCase() === text.toLowerCase(),
    );
    if (text !== "" && !seen) parts.push(text);
  }

  if (posting.workplace_type === "remote") parts.push("remote");

  return parts.length === 0 ? null : parts.join(", ");
}

/**
 * Vacancies of a career source on Pinpoint: the company from the address, a
 * `postings.json` request and parsing. An address without a company is
 * `unreadable` without a request.
 */
export async function readPinpoint(
  sourceUrl: string,
  client: HttpClient,
): Promise<ParseResult> {
  const company = pinpointCompany(sourceUrl);

  if (company === null) {
    return UNREADABLE;
  }

  const fetched = await fetchJson(
    client,
    `https://${company}.${DOMAIN}/postings.json`,
  );

  return fetched.ok ? parsePinpointPostings(fetched.answer) : fetched;
}
