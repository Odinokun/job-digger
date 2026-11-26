/**
 * The softgarden parser (task 3.28). softgarden has two products with public
 * boards, and both are read:
 *
 * - the old board `https://{company}.softgarden.io/{lang}/vacancies` - server
 *   HTML with all vacancies at once (JavaScript draws the pages);
 * - the new career site `https://{company}.career.softgarden.de` - a schema.org
 *   `DataFeed` at `/jobs.feed.json`.
 *
 * The documented API (dev.softgarden.de, `api.softgarden.io`) needs a client ID
 * from softgarden, so it is closed to us. Both formats were checked with real
 * requests on 19.11.2026; they have no documentation.
 */
import * as cheerio from "cheerio";

import type { HttpClient } from "../http/client.ts";
import {
  collectVacancies,
  fetchJson,
  fetchText,
  isRecord,
  isWebUrl,
  UNREADABLE,
  type ReadVacancy,
} from "./shared.ts";
import type { ParseResult } from "./types.ts";

const BOARD_DOMAIN = "softgarden.io";
const SITE_DOMAIN = "career.softgarden.de";

/** `softgarden.io` subdomains that are not company boards. */
const SERVICE_LABELS = new Set(["www", "api", "dev", "app"]);

/** A softgarden source: the old board or the new career site. */
export type SoftgardenSource = { kind: "board" | "site"; origin: string };

/**
 * The board or career site from any of their addresses, including a vacancy
 * link, or `null` if it is not softgarden.
 */
export function softgardenSource(sourceUrl: string): SoftgardenSource | null {
  let host: string;

  try {
    host = new URL(sourceUrl).hostname.toLowerCase();
  } catch {
    return null;
  }

  const company = (domain: string) => {
    if (!host.endsWith(`.${domain}`)) return null;
    const label = host.slice(0, -domain.length - 1);
    return label.includes(".") ? null : label;
  };

  const site = company(SITE_DOMAIN);
  if (site !== null) {
    return { kind: "site", origin: `https://${site}.${SITE_DOMAIN}` };
  }

  const board = company(BOARD_DOMAIN);
  if (board !== null && !SERVICE_LABELS.has(board)) {
    return { kind: "board", origin: `https://${board}.${BOARD_DOMAIN}` };
  }

  return null;
}

/** The address the source is read from: the board's vacancy list or the site. */
export function softgardenBoardUrl(source: SoftgardenSource): string {
  return source.kind === "board"
    ? `${source.origin}/en/vacancies`
    : source.origin;
}

/** The sign of an old board page: vacancy map data in the page script. */
const MAP_DATA = "SG.allJobLocations = [";

const POSTING_ID = /SG\.allJobLocations\.push\(\{[^}]*?postingId:\s*(\d+)/g;

/**
 * Vacancies of the old board from HTML. `pageUrl` is the page address after
 * redirects; relative links (`../job/{id}/...`) resolve against it.
 *
 * A card is `.matchElement#job_id_{id}` (the table header is a `.matchElement`
 * too), the title and link are `.title a`, the locations are
 * `.location-view-item`, comma-separated. The HTML has no counter (JavaScript
 * fills it in), so zero is trusted through the map data: every `postingId` from
 * `SG.allJobLocations` must be among the cards. Otherwise changed markup would
 * give "zero vacancies" - deleting all of them.
 */
export function parseSoftgardenBoard(
  html: string,
  pageUrl: string,
): ParseResult {
  if (!html.includes(MAP_DATA)) {
    return UNREADABLE;
  }

  const $ = cheerio.load(html);
  // The table header is a `.matchElement` too, but with `.matchHeadline`.
  const cards = $(".matchElement:not(.matchHeadline)")
    .toArray()
    .map((element) => {
      const card = $(element);
      const link = card.find(".title a").first();

      return {
        id: /^job_id_(\d+)$/.exec(card.attr("id") ?? "")?.[1] ?? null,
        title: link.length === 0 ? null : link.text(),
        href: link.attr("href") ?? null,
        places: card
          .find(".location-view-item")
          .toArray()
          .map((place) => $(place).text()),
      };
    });

  const shown = new Set(cards.map((card) => card.id));
  const mapped = [...html.matchAll(POSTING_ID)].map((match) => match[1]);

  if (mapped.some((id) => !shown.has(id))) {
    return UNREADABLE;
  }

  return collectVacancies(cards, boardVacancyOn(pageUrl));
}

const boardVacancyOn =
  (pageUrl: string): ReadVacancy =>
  ({ id, title, href, places }) => {
    if (
      typeof id !== "string" ||
      typeof title !== "string" ||
      typeof href !== "string"
    ) {
      return "broken";
    }

    let url: URL;
    try {
      url = new URL(href, pageUrl);
    } catch {
      return "skip";
    }
    // `jobDbPVId` and the language in the query string do not belong to the vacancy.
    url.search = "";

    if (title.trim() === "" || !isWebUrl(url.toString())) {
      return "skip";
    }

    return {
      externalId: id,
      title: title.trim(),
      url: url.toString(),
      location: joinPlaces(
        (Array.isArray(places) ? places : []).map((place) =>
          // The comma between locations is part of each one's text, except the last.
          String(place).trim().replace(/,$/, ""),
        ),
        ", ",
      ),
    };
  };

/**
 * Vacancies of the new career site from the feed: a `DataFeed` with
 * `dataFeedElement`, where each `item` is a `JobPosting`. `numberOfItems` must
 * equal the number of records - that shows the feed is whole.
 *
 * `externalId` is `identifier.value` (the same as in the `/jobs/{id}/...`
 * address), the title is `title`, the link is `url`, the location is the city (or
 * region) and country of each `jobLocation`; several places are joined with "; ".
 * softgarden fills empty address parts with "-", and they are dropped.
 */
export function parseSoftgardenFeed(answer: unknown): ParseResult {
  if (
    !isRecord(answer) ||
    !Array.isArray(answer.dataFeedElement) ||
    answer.numberOfItems !== answer.dataFeedElement.length
  ) {
    return UNREADABLE;
  }

  return collectVacancies(answer.dataFeedElement, (element) =>
    isRecord(element.item) ? feedVacancy(element.item) : "broken",
  );
}

const feedVacancy: ReadVacancy = (job) => {
  const { title, url, identifier, jobLocation } = job;
  const id = isRecord(identifier) ? identifier.value : undefined;

  if (
    (typeof id !== "number" && typeof id !== "string") ||
    !/^\d+$/.test(String(id)) ||
    typeof title !== "string" ||
    typeof url !== "string"
  ) {
    return "broken";
  }

  if (title.trim() === "" || !isWebUrl(url)) {
    return "skip";
  }

  const places = (Array.isArray(jobLocation) ? jobLocation : [jobLocation])
    .map((place) => (isRecord(place) ? placeOf(place.address) : null))
    .filter((place): place is string => place !== null);

  return {
    externalId: String(id),
    title: title.trim(),
    url,
    location: joinPlaces(places, "; "),
  };
};

function placeOf(address: unknown): string | null {
  if (!isRecord(address)) {
    return null;
  }

  const part = (value: unknown) =>
    typeof value === "string" && value.trim() !== "-" ? value.trim() : "";
  const area = part(address.addressLocality) || part(address.addressRegion);

  return joinPlaces([area, part(address.addressCountry)], ", ");
}

/** Non-empty parts without repeats joined with `separator`, or `null`. */
function joinPlaces(parts: string[], separator: string): string | null {
  const unique = [...new Set(parts.filter((part) => part !== ""))];
  return unique.length === 0 ? null : unique.join(separator);
}

/**
 * Vacancies of a career source on softgarden: the source kind from the address,
 * one request and parsing. A non-softgarden address is `unreadable` without any
 * request.
 *
 * The feed rejects an unknown career site with a 400 ("No such client for
 * domain") rather than a 404 - here it is `not-found`, because this request
 * without parameters has no other 400s.
 */
export async function readSoftgarden(
  sourceUrl: string,
  client: HttpClient,
): Promise<ParseResult> {
  const source = softgardenSource(sourceUrl);

  if (source === null) {
    return UNREADABLE;
  }

  if (source.kind === "board") {
    const fetched = await fetchText(client, softgardenBoardUrl(source));
    return fetched.ok
      ? parseSoftgardenBoard(fetched.body, fetched.url)
      : fetched;
  }

  const fetched = await fetchJson(client, `${source.origin}/jobs.feed.json`);

  if (!fetched.ok) {
    return fetched.error.reason === "bad-status" && fetched.error.status === 400
      ? { ok: false, error: { reason: "not-found" } }
      : fetched;
  }

  return parseSoftgardenFeed(fetched.answer);
}
