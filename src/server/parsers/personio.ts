/**
 * The Personio parser: vacancies from the public XML feed of a board
 * `https://{company}.jobs.personio.de/xml` (task 3.27).
 *
 * The feed is documented (developer.personio.de/docs/retrieving-open-job-positions):
 * the root is `<workzag-jobs>`, a vacancy is `<position>`, the vacancy link is
 * `/job/{id}`. What the documentation does not say was checked with real
 * requests on 19.11.2026: no key, all vacancies in one document, an unknown
 * board is a 404.
 */
import * as cheerio from "cheerio";

import type { HttpClient } from "../http/client.ts";
import {
  collectVacancies,
  fetchText,
  UNREADABLE,
  type ReadVacancy,
} from "./shared.ts";
import type { ParseResult } from "./types.ts";

/**
 * Board domains. `.com` serves the same as `.de` (checked on Astrafy), so the
 * board stays on the domain the user gave.
 */
const DOMAINS = ["jobs.personio.de", "jobs.personio.com"];

/**
 * The board from a board, feed or vacancy address (`acme.jobs.personio.de/job/7`
 * → `https://acme.jobs.personio.de`), or `null` if it is not a Personio board.
 * `www` is Personio's own site, not a company.
 */
export function personioBoard(sourceUrl: string): string | null {
  let host: string;

  try {
    host = new URL(sourceUrl).hostname.toLowerCase();
  } catch {
    return null;
  }

  const domain = DOMAINS.find((suffix) => host.endsWith(`.${suffix}`));

  if (domain === undefined) {
    return null;
  }

  const company = host.slice(0, -domain.length - 1);

  return company.includes(".") || company === "www"
    ? null
    : `https://${company}.${domain}`;
}

/**
 * Vacancies from the XML feed. `board` is the board address; the vacancy link
 * `/job/{id}` is built from it, as in the documentation example.
 *
 * `externalId` is `id` (digits only), the title is `name`, the location is
 * `office` followed by `additionalOffices`, comma-separated, without repeats.
 */
export function parsePersonioFeed(xml: string, board: string): ParseResult {
  const $ = cheerio.load(xml, { xml: true });
  const root = $.root().children("workzag-jobs");

  if (root.length !== 1) {
    return UNREADABLE;
  }

  const positions = root
    .children("position")
    .toArray()
    .map((element) => {
      const position = $(element);
      // Direct children only: description blocks (`jobDescription`) have a `<name>` too.
      const field = (name: string) => {
        const found = position.children(name);
        return found.length === 0 ? null : found.first().text();
      };

      return {
        id: field("id"),
        name: field("name"),
        offices: [
          field("office"),
          ...position
            .children("additionalOffices")
            .children("office")
            .toArray()
            .map((office) => $(office).text()),
        ],
      };
    });

  return collectVacancies(positions, vacancyOn(board));
}

/** A feed position reader; the vacancy link is built from `board`. */
const vacancyOn =
  (board: string): ReadVacancy =>
  (position) => {
    const { id, name, offices } = position;

    if (
      typeof id !== "string" ||
      !/^\d+$/.test(id.trim()) ||
      typeof name !== "string"
    ) {
      return "broken";
    }

    if (name.trim() === "") {
      return "skip";
    }

    return {
      externalId: id.trim(),
      title: name.trim(),
      url: `${board}/job/${id.trim()}`,
      location: placeOf(offices),
    };
  };

function placeOf(offices: unknown): string | null {
  const places = (Array.isArray(offices) ? offices : [])
    .filter((office): office is string => typeof office === "string")
    .map((office) => office.trim())
    .filter((office) => office !== "");
  const unique = [...new Set(places)];

  return unique.length === 0 ? null : unique.join(", ");
}

/**
 * Vacancies of a career source on Personio: the board from the address, a `/xml`
 * request through the HTTP client and parsing. An address without a Personio
 * board is `unreadable` without any request.
 */
export async function readPersonio(
  sourceUrl: string,
  client: HttpClient,
): Promise<ParseResult> {
  const board = personioBoard(sourceUrl);

  if (board === null) {
    return UNREADABLE;
  }

  const fetched = await fetchText(client, `${board}/xml`);

  return fetched.ok ? parsePersonioFeed(fetched.body, board) : fetched;
}
