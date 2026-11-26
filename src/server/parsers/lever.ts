/**
 * The Lever parser: vacancies from the public Postings API
 * (https://github.com/lever/postings-api).
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
import { pagesToRead, type ReadDepth } from "./vacancies-to-check.ts";
import type { ParsedVacancy, ParseResult } from "./types.ts";

/** The Lever region: the API host depends on it (`api.lever.co` or `api.eu.lever.co`). */
export type LeverRegion = "global" | "eu";

/** Lever board hosts and their regions (Postings API documentation, "global / EU"). */
const BOARD_HOSTS: Record<string, LeverRegion> = {
  "jobs.lever.co": "global",
  "jobs.eu.lever.co": "eu",
};

/**
 * The Lever site from a source address, or `null` if the address is not a Lever
 * board. The site is the first path segment: `jobs.lever.co/palantir`, as well as
 * posting links (`/palantir/<id>`) and application forms (`/palantir/<id>/apply`).
 */
export function leverSite(
  sourceUrl: string,
): { site: string; region: LeverRegion } | null {
  let url: URL;

  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }

  const region = BOARD_HOSTS[url.hostname];
  const [site] = url.pathname.split("/").filter(Boolean);

  return region === undefined || site === undefined ? null : { site, region };
}

/**
 * Vacancies from the `GET /v0/postings/{site}?mode=json` response - an array of
 * postings.
 *
 * `externalId` is the posting `id` (a UUID string, the same as in `hostedUrl`),
 * the title is `text`, the link is `hostedUrl`. The location is everything in
 * `categories.allLocations`, comma-separated (the main one is there too), and
 * without them `categories.location`.
 *
 * A broken structure fails the whole response, bad data skips the vacancy
 * (`collectVacancies`, README "Shared format").
 */
export function parseLeverPostings(answer: unknown): ParseResult {
  if (!Array.isArray(answer)) {
    return UNREADABLE;
  }

  return collectVacancies(answer, toVacancy);
}

const toVacancy: ReadVacancy = (posting) => {
  const { id, text, hostedUrl, categories } = posting;

  if (
    typeof id !== "string" ||
    id.trim() === "" ||
    typeof text !== "string" ||
    typeof hostedUrl !== "string"
  ) {
    return "broken";
  }

  if (text.trim() === "" || !isWebUrl(hostedUrl)) {
    return "skip";
  }

  return {
    externalId: id,
    title: text.trim(),
    url: hostedUrl,
    location: isRecord(categories) ? locationOf(categories) : null,
  };
};

function locationOf(categories: Record<string, unknown>): string | null {
  const { allLocations, location } = categories;

  const all = Array.isArray(allLocations)
    ? allLocations
        .filter((place): place is string => typeof place === "string")
        .map((place) => place.trim())
        .filter((place) => place !== "")
    : [];

  if (all.length > 0) {
    return all.join(", ");
  }

  const primary = typeof location === "string" ? location.trim() : "";

  return primary === "" ? null : primary;
}

/** The API by board region (Postings API documentation, "global / EU"). */
const API_HOSTS: Record<LeverRegion, string> = {
  global: "api.lever.co",
  eu: "api.eu.lever.co",
};

/**
 * How many postings to ask for at once. Without `limit` Lever returns everything
 * at once, and with descriptions that can exceed the response size limit:
 * Palantir with 306 vacancies is 5.9 MB against a `MAX_BYTES` of 5 MB (checked
 * 18.11.2026). A hundred postings are about 2 MB.
 */
export const LEVER_PAGE_SIZE = 100;

/**
 * Vacancies of a career source on Lever: the site from the address, API pages
 * through the HTTP client (`skip`/`limit`) and parsing of each. An address
 * without a Lever site is `unreadable` without any request.
 *
 * A failure of any page is a failure of the whole source: half a list would look
 * like "the other vacancies are gone" and lead to their deletion
 * (src/server/parsers/README.md).
 */
export async function readLever(
  sourceUrl: string,
  client: HttpClient,
  {
    pageSize = LEVER_PAGE_SIZE,
    depth = "full",
    maxPages = pagesToRead({ pageSize, depth }),
  }: { pageSize?: number; depth?: ReadDepth; maxPages?: number } = {},
): Promise<ParseResult> {
  const found = leverSite(sourceUrl);

  if (found === null) {
    return UNREADABLE;
  }

  const base = `https://${API_HOSTS[found.region]}/v0/postings/${encodeURIComponent(found.site)}`;
  const vacancies: ParsedVacancy[] = [];
  let skipped = 0;
  // Becomes `false` only when the list ended by itself, not at the limit.
  let truncated = true;

  for (let page = 0; page < maxPages; page += 1) {
    const fetched = await fetchJson(
      client,
      `${base}?mode=json&skip=${page * pageSize}&limit=${pageSize}`,
    );

    if (!fetched.ok) {
      return fetched;
    }

    const parsed = parseLeverPostings(fetched.answer);

    if (!parsed.ok) {
      return parsed;
    }

    vacancies.push(...parsed.vacancies);
    skipped += parsed.skipped;

    // An incomplete page is the last. A full one may be the last too: then the
    // next comes back empty. Skipped records took up room on the page too.
    if (parsed.vacancies.length + parsed.skipped < pageSize) {
      truncated = false;
      break;
    }
  }

  return truncated
    ? { ok: true, vacancies, skipped, truncated: true }
    : { ok: true, vacancies, skipped };
}
