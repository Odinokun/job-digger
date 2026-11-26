/**
 * The PeopleForce parser: vacancies from a company's public career page
 * (`{company}.peopleforce.io/careers`). The PeopleForce Careers API needs a
 * company key (https://developer.peopleforce.io/careers/v1/getting-started), so
 * we read the HTML as a visitor sees it (the README next to this file, "PeopleForce").
 */
import * as cheerio from "cheerio";

import type { HttpClient } from "../http/client.ts";
import {
  collectVacancies,
  fetchText,
  UNREADABLE,
  type ReadVacancy,
} from "./shared.ts";
import { pagesToRead, type ReadDepth } from "./vacancies-to-check.ts";
import type { ParsedVacancy, ParseResult } from "./types.ts";

/**
 * The address of the company's career site (`https://team.peopleforce.io`), or
 * `null` if the address is not a company site on PeopleForce. The company is the
 * only subdomain before `peopleforce.io`; `peopleforce.io` itself and `www` are
 * the platform's site, not a company's.
 */
export function peopleforceSite(sourceUrl: string): string | null {
  let url: URL;

  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }

  const labels = url.hostname.split(".");

  if (
    labels.length !== 3 ||
    !url.hostname.endsWith(".peopleforce.io") ||
    labels[0] === "www"
  ) {
    return null;
  }

  return `https://${url.hostname}`;
}

/**
 * Whether this is a PeopleForce career page, whatever its address (task 5.13):
 * a company may keep PeopleForce on its own domain
 * (`peopleforce.softconstruct.com`), and it cannot be recognised by the host.
 *
 * There are two signs, and both are needed: the `#results` list the parser
 * reads, and the "Powered by PeopleForce" credit (`.credit` with a link to
 * `peopleforce.io`) - it is on every saved page. A single link to
 * `peopleforce.io` is not yet a board: any page that mentions this HR service has one.
 */
export function isPeopleForcePage(html: string): boolean {
  const $ = cheerio.load(html);

  return (
    $("#results").length === 1 &&
    $('.credit a[href^="https://peopleforce.io"]').length > 0
  );
}

/** A list page: the vacancies and whether there is another page after it. */
export type PeopleForcePage =
  | (Extract<ParseResult, { ok: true }> & { hasNext: boolean })
  | Extract<ParseResult, { ok: false }>;

/** A vacancy path: `/careers/v/{ID}-{slug}`, the ID is a number. */
const VACANCY_PATH = /^\/careers\/v\/(\d+)(?:-|$)/;

/** The "X - Y" counter: which vacancies by number are on this page. */
const RANGE = /^(\d+)\s*-\s*(\d+)$/;

/**
 * Vacancies of one page of the `/careers?page=N` list.
 *
 * The page is HTML, so trust in zero is handled separately here
 * (src/server/parsers/README.md): above the cards PeopleForce writes a
 * "Displaying X - Y of N" counter, and there must be exactly Y - X + 1 cards. The
 * numbers in `<strong>` do not depend on the language, the text around them does
 * ("Відображено ... з ..."). No counter and no cards means there really are no
 * vacancies ("There are currently no vacancies."). Any other combination is
 * changed markup, and the whole response fails.
 *
 * `externalId` is the numeric ID from the path, the link is the path resolved
 * against the page address, the location is the text next to the map pin icon.
 *
 * Whether there is a next page also comes from the counter: Y is less than N.
 * PeopleForce's "next" link varies - the new markup has `rel="next"`, the older
 * one (SoftConstruct on its own domain, 21.11.2026) only `aria-label="next"`. A
 * missed link would read 10 vacancies of 215 as the whole list, and the check
 * would consider the rest closed.
 */
export function parsePeopleForcePage(
  html: string,
  pageUrl: string,
): PeopleForcePage {
  const $ = cheerio.load(html);
  const results = $("#results");

  if (results.length !== 1) {
    return UNREADABLE;
  }

  const cards = results
    .find("h4 a")
    .toArray()
    .map((link) => {
      const card = $(link).closest("h4").parent();
      const place = card.find(".fa-map-marker-alt").first().parent();

      return {
        href: $(link).attr("href"),
        title: $(link).text(),
        location: place.length === 0 ? null : place.text(),
      };
    });

  const counter = results
    .find("strong")
    .toArray()
    .map((element) => $(element).text().trim());

  if (counter.length === 0) {
    return cards.length === 0
      ? { ok: true, vacancies: [], skipped: 0, hasNext: false }
      : UNREADABLE;
  }

  const range = RANGE.exec(counter[0] ?? "");
  const total = /^\d+$/.test(counter[1] ?? "") ? Number(counter[1]) : null;

  if (
    counter.length !== 2 ||
    range === null ||
    total === null ||
    Number(range[2]) > total ||
    cards.length !== Number(range[2]) - Number(range[1]) + 1
  ) {
    return UNREADABLE;
  }

  const result = collectVacancies(cards, readerFor(pageUrl));

  if (!result.ok) {
    return result;
  }

  return { ...result, hasNext: Number(range[2]) < total };
}

function readerFor(pageUrl: string): ReadVacancy {
  return ({ href, title, location }) => {
    if (typeof href !== "string" || typeof title !== "string") {
      return "broken";
    }

    let url: URL;

    try {
      url = new URL(href, pageUrl);
    } catch {
      return "broken";
    }

    const id = VACANCY_PATH.exec(url.pathname)?.[1];

    if (id === undefined) {
      return "broken";
    }

    if (title.trim() === "") {
      return "skip";
    }

    const place = typeof location === "string" ? location.trim() : "";

    return {
      externalId: id,
      title: title.trim(),
      url: url.toString(),
      location: place === "" ? null : place,
    };
  };
}

/**
 * The career site of a source already saved as PeopleForce. On `*.peopleforce.io`
 * it is as in `peopleforceSite`; on any other host it is its origin: such a
 * source became PeopleForce by its page markup (`isPeopleForcePage`, task 5.13),
 * so the host proves nothing here any more.
 */
function careerSiteOf(sourceUrl: string): string | null {
  const onPlatform = peopleforceSite(sourceUrl);

  if (onPlatform !== null) {
    return onPlatform;
  }

  let url: URL;

  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }

  return url.protocol === "https:" || url.protocol === "http:"
    ? url.origin
    : null;
}

/** How many vacancies PeopleForce shows on a `/careers` page (not configurable). */
export const PEOPLEFORCE_PAGE_SIZE = 10;

/**
 * Vacancies of a career source on PeopleForce: the company site from the
 * address, `/careers?page=N` pages through the HTTP client and parsing of each.
 * An address that is not a web page is `unreadable` without any request.
 *
 * The next page is requested only while the counter says the list has not ended
 * (`parsePeopleForcePage`): PeopleForce does not reject a page number past the
 * end of the list but serves the last page again (checked on Webellian
 * 18.11.2026). A failure of any page is a failure of the whole source.
 */
export async function readPeopleForce(
  sourceUrl: string,
  client: HttpClient,
  {
    depth = "full",
    maxPages = pagesToRead({ pageSize: PEOPLEFORCE_PAGE_SIZE, depth }),
  }: { depth?: ReadDepth; maxPages?: number } = {},
): Promise<ParseResult> {
  const site = careerSiteOf(sourceUrl);

  if (site === null) {
    return UNREADABLE;
  }

  const vacancies: ParsedVacancy[] = [];
  let skipped = 0;
  // Becomes `false` only when the list ended by itself, not at the limit.
  let truncated = true;

  for (let page = 1; page <= maxPages; page += 1) {
    const pageUrl = `${site}/careers?page=${page}`;
    const fetched = await fetchText(client, pageUrl);

    if (!fetched.ok) {
      return fetched;
    }

    const parsed = parsePeopleForcePage(fetched.body, pageUrl);

    if (!parsed.ok) {
      return parsed;
    }

    vacancies.push(...parsed.vacancies);
    skipped += parsed.skipped;

    if (!parsed.hasNext) {
      truncated = false;
      break;
    }
  }

  return truncated
    ? { ok: true, vacancies, skipped, truncated: true }
    : { ok: true, vacancies, skipped };
}
