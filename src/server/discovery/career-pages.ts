/**
 * The second search method: career pages on the company's own site
 * (src/server/discovery/README.md) - Careers / Jobs / Karriere / Вакансії links,
 * typical addresses, the sitemap.
 */
import * as cheerio from "cheerio";

import type { HttpClient } from "../http/client.ts";
import { isPeopleForcePage } from "../parsers/peopleforce.ts";
import { fetchText } from "../parsers/shared.ts";
import { atsLinksOnPage } from "./ats-links.ts";
import { boardKey, boardUrlOf, type BoardUrl } from "./board-url.ts";

/** Typical career page addresses - only when the home page has no link. */
const USUAL_PATHS = ["/careers", "/jobs"];

/**
 * How many career pages we read. Each one is a request to someone else's site
 * with a politeness pause, and a company never has more than three separate
 * career sections.
 */
const MAX_CAREER_PAGES = 3;

/** What the site's career pages gave. */
export type SiteCareerPages = {
  /** ATS boards the career pages lead to. */
  boards: BoardUrl[];
  /** Career pages without links to an ATS - the company's own pages. */
  pages: string[];
};

/** A page that was read: the body and the address after redirects. */
type Page = { body: string; url: string };

/**
 * Words that make a path segment a career one. Only a whole segment: `/jobs` -
 * yes, `/jobsite-safety` - no.
 */
const PATH_WORDS = new Set([
  "career",
  "careers",
  "jobs",
  "join-us",
  "work-with-us",
  "open-positions",
  "vacancies",
  "karriere",
  "stellenangebote",
  "jobs-karriere",
  "kariera",
  "praca",
  "vacatures",
  "werken-bij",
  "carrieres",
  "emplois",
  "empleo",
  "trabaja-con-nosotros",
  "vakansii",
  "vacancy",
]);

/** The first host label that makes a site subdomain a career one (`careers.acme.com`). */
const HOST_WORDS = new Set(["careers", "career", "jobs", "karriere"]);

/**
 * Link text that makes a link a career one: the whole text is a career phrase,
 * without punctuation or arrows at the edges. Not "contains the word": "Career
 * guides" and "Read our jobs report" are not career pages (Grammarly, 19.11.2026).
 */
const TEXT_WORDS = new RegExp(
  `^(${[
    "careers?",
    "jobs",
    "join us",
    "work with us",
    "we're hiring",
    "open positions",
    "vacancies",
    "karriere",
    "stellenangebote",
    "kariera",
    "praca",
    "vacatures",
    "werken bij",
    "carrières",
    "emplois",
    "empleo",
    "вакансії",
    "кар['ʼ’]єра",
    "вакансии",
    "карьера",
  ].join("|")})$`,
  "iu",
);

/**
 * The site's career pages a page links to - one each, in order of appearance.
 *
 * Only the site itself counts: the same host without `www.` or its subdomain.
 * Someone else's "Careers" page does not prove it belongs to the company, and
 * `atsLinksOnPage` finds ATS boards.
 *
 * A vacancy link is cut at the career segment: `/careers/designer-12` gives
 * `/careers`, so a vacancy list on the home page gives a single page.
 */
export function careerPagesOnPage(html: string, pageUrl: string): string[] {
  const $ = cheerio.load(html);
  const page = new URL(pageUrl);
  const site = withoutWww(page.hostname);
  const found = new Set<string>();

  $("a[href]").each((_, element) => {
    const $element = $(element);
    const address = $element.attr("href") ?? "";
    const text = $element.text().replace(/\s+/g, " ").trim();
    const career = careerPageOf(address, text, page, site);

    if (career !== null) {
      found.add(career);
    }
  });

  return [...found];
}

/**
 * The site's career pages from its sitemap (https://www.sitemaps.org/protocol.html):
 * `<url><loc>` addresses with a career word in the path, cut at that word.
 *
 * There is no link text here, so only the path and the subdomain count. Nested
 * sitemaps (`<sitemapindex>`) are not read: each is one more request to someone
 * else's site.
 */
export function careerPagesInSitemap(xml: string, siteUrl: string): string[] {
  // `xml: true` parses as XML, not HTML (node_modules/cheerio/dist/esm/options.d.ts).
  const $ = cheerio.load(xml, { xml: true });
  const site = new URL(siteUrl);
  const found = new Set<string>();

  $("url > loc").each((_, element) => {
    const career = careerPageOf(
      $(element).text().trim(),
      "",
      site,
      withoutWww(site.hostname),
    );

    if (career !== null) {
      found.add(career);
    }
  });

  return [...found];
}

function careerPageOf(
  address: string,
  text: string,
  page: URL,
  site: string,
): string | null {
  let url: URL;

  try {
    url = new URL(address, page);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  if (!isSameSite(url.hostname, site) || boardUrlOf(url.toString()) !== null) {
    return null;
  }

  // An anchor on the same page (`#careers`) is not a separate page.
  if (url.origin === page.origin && url.pathname === page.pathname) {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const word = segments.findIndex((segment) =>
    PATH_WORDS.has(segment.toLowerCase()),
  );

  if (word !== -1) {
    return `${url.origin}/${segments.slice(0, word + 1).join("/")}`;
  }

  const [label] = url.hostname.split(".");
  if (
    (label !== undefined && HOST_WORDS.has(label) && url.hostname !== site) ||
    TEXT_WORDS.test(trimToLetters(text))
  ) {
    return `${url.origin}${url.pathname}`;
  }

  return null;
}

/** Text without non-letter characters at the edges: "Careers →" becomes "Careers". */
function trimToLetters(text: string): string {
  return text.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
}

/**
 * Whether the address itself is a career one: a career path segment or
 * subdomain. Needed after a redirect - there is no link text there any more.
 */
function isCareerAddress(address: string): boolean {
  const url = new URL(address);
  const [label] = url.hostname.split(".");

  return (
    url.pathname
      .split("/")
      .some((segment) => PATH_WORDS.has(segment.toLowerCase())) ||
    (label !== undefined && HOST_WORDS.has(label))
  );
}

function withoutWww(host: string): string {
  return host.startsWith("www.") ? host.slice(4) : host;
}

/** The same site: the host without `www.` matches or is its subdomain. */
function isSameSite(host: string, site: string): boolean {
  const bare = withoutWww(host);
  return bare === site || bare.endsWith(`.${site}`);
}

/**
 * The site's career pages and the ATS boards they lead to (task 5.03).
 *
 * `home` is the home page that was already read (the ATS link search read it,
 * 5.02). The order goes from the cheapest for someone else's site: links from
 * the home page; without them, typical addresses; without those, the sitemap.
 * The pages found (up to `MAX_CAREER_PAGES`) are read, and their links to an ATS
 * become boards. A page without an ATS is the company's own page; whether it
 * can be read is up to the trial read (5.06).
 *
 * A page that did not answer is simply not a finding: the home page has already
 * been read, and one page failing does not fail the whole search.
 */
export async function findSiteCareerPages(
  home: Page,
  client: HttpClient,
): Promise<SiteCareerPages> {
  const candidates = await careerCandidates(home, client);
  const boards = new Map<string, BoardUrl>();
  // A set: two addresses may redirect to one page (Grammarly, 19.11.2026 -
  // both `/careers` and `/jobs` lead to `superhuman.com`).
  const pages = new Set<string>();

  for (const candidate of candidates.slice(0, MAX_CAREER_PAGES)) {
    const page =
      typeof candidate === "string"
        ? await readPage(client, candidate)
        : candidate;

    if (page === null) {
      continue;
    }

    const linked = [
      ...atsLinksOnPage(page.body, page.url),
      ...(await peopleForceOnSite(page, client)),
    ];
    for (const board of linked) {
      if (!boards.has(boardKey(board))) {
        boards.set(boardKey(board), board);
      }
    }
    if (linked.length === 0) {
      pages.add(withoutQuery(page.url));
    }
  }

  return { boards: [...boards.values()], pages: [...pages] };
}

/**
 * PeopleForce on the company's domain (task 5.13): it cannot be recognised by
 * the host, so `atsLinksOnPage` does not see it. The board is the career page
 * itself if it has PeopleForce markup, or, one step further, a career page on
 * another host of the same site that it leads to (SoftConstruct: `/careers` →
 * `peopleforce.softconstruct.com/careers`).
 *
 * The step further goes only to another host and to at most `MAX_CAREER_PAGES`
 * pages: the candidate search has already gone through the pages of the site's
 * own host, and every page is one more request to someone else's site.
 */
async function peopleForceOnSite(
  page: Page,
  client: HttpClient,
): Promise<BoardUrl[]> {
  if (isPeopleForcePage(page.body)) {
    return [peopleForceBoard(page.url)];
  }

  const host = new URL(page.url).host;
  const further = careerPagesOnPage(page.body, page.url)
    .filter((url) => new URL(url).host !== host)
    .slice(0, MAX_CAREER_PAGES);
  const boards: BoardUrl[] = [];

  for (const url of further) {
    const next = await readPage(client, url);

    if (next !== null && isPeopleForcePage(next.body)) {
      boards.push(peopleForceBoard(next.url));
    }
  }

  return boards;
}

/** A PeopleForce board address - `/careers` from the origin, as on `*.peopleforce.io`. */
function peopleForceBoard(pageUrl: string): BoardUrl {
  return {
    url: `${new URL(pageUrl).origin}/careers`,
    platform: "peopleforce",
  };
}

/**
 * Candidate career pages: addresses still to be read, or pages already read (a
 * typical address is read to find out whether it exists).
 */
async function careerCandidates(
  home: Page,
  client: HttpClient,
): Promise<Array<string | Page>> {
  const linked = careerPagesOnPage(home.body, home.url);
  if (linked.length > 0) {
    return linked;
  }

  const origin = new URL(home.url).origin;
  const usual: Page[] = [];
  for (const path of USUAL_PATHS) {
    const page = await readPage(client, `${origin}${path}`);
    if (page !== null) {
      usual.push(page);
    }
  }
  if (usual.length > 0) {
    return usual;
  }

  const sitemap = await fetchText(client, `${origin}/sitemap.xml`);
  return sitemap.ok ? careerPagesInSitemap(sitemap.body, home.url) : [];
}

/**
 * The career page at an address, or `null` if it did not answer or a redirect
 * led to where careers are no longer visible: an error page that answers 200
 * (Palantir, 19.11.2026), or the home page instead of a missing `/careers`.
 */
async function readPage(client: HttpClient, url: string): Promise<Page | null> {
  const page = await fetchText(client, url);

  if (!page.ok) {
    return null;
  }

  const moved = withoutQuery(page.url) !== withoutQuery(url);
  return moved && !isCareerAddress(page.url)
    ? null
    : { body: page.body, url: page.url };
}

function withoutQuery(address: string): string {
  const url = new URL(address);
  return `${url.origin}${url.pathname}`;
}
