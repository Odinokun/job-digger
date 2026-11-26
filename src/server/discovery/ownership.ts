/**
 * Whether a finding belongs to the company (src/server/discovery/README.md,
 * item 4): a board found only by name is tied to the company only if the board
 * itself leads to the company site.
 */
import * as cheerio from "cheerio";

/** What the board page says about its company. */
export type BoardOwnership =
  /** The board leads to the company site - the finding is reliable. */
  | { kind: "confirmed" }
  /** The board names another site as its own - likely another company with the same name. */
  | { kind: "other"; site: string }
  /** Neither is visible. */
  | { kind: "unknown" };

/**
 * Explicit "this company's site" signals on a board page. Only by them can a
 * board be attributed to another company: an arbitrary external link (LinkedIn,
 * a privacy policy) means no such thing.
 *
 * - Lever: the logo in the header and "{Company} Home Page" in the footer;
 * - Breezy HR: the header item `link company` ("Company website");
 * - Personio: the logo in the header (`a.logo-wrapper`);
 * - softgarden, career site: the logo in the header (`HeaderLogo__BrandLink-...`,
 *   a styled-components class whose start alone is stable). The old softgarden
 *   board has no external links;
 * - Ashby: the `publicWebsite` field in the page data (`ASHBY_WEBSITE`).
 */
const WEBSITE_LINKS =
  "a.main-header-logo[href], .main-footer-text a[href], li.link.company a[href], a.logo-wrapper[href], a[class^='HeaderLogo__BrandLink'][href]";

/** Ashby renders the board with JavaScript and puts the organisation's site in the page JSON. */
const ASHBY_WEBSITE = /"publicWebsite"\s*:\s*"(https?:[^"]+)"/g;

/**
 * The platforms' own hosts: links to them are about the platform, not the
 * company (a Lever logo without a company site leads to the board itself).
 */
const PLATFORM_DOMAINS = [
  "lever.co",
  "greenhouse.io",
  "greenhouse.com",
  "ashbyhq.com",
  "peopleforce.io",
  "breezy.hr",
  "cleverstaff.net",
  "hurma.work",
  "personio.de",
  "personio.com",
  "softgarden.io",
  "softgarden.de",
  "myworkdayjobs.com",
  "myworkdaysite.com",
  "workable.com",
  "bamboohr.com",
  "pinpointhq.com",
  "talentadore.com",
];

/**
 * Whose board this is, from the point of view of the company with the site
 * `companySiteUrl`.
 *
 * Any link to the company site confirms it: if the board leads there anywhere,
 * the link goes both ways - the name matched, and the board itself points at the
 * site. The same site means the same host without `www.` or a subdomain either
 * way (`careers.palantir.com` and `palantir.com`).
 */
export function boardOwnership(
  html: string,
  companySiteUrl: string,
): BoardOwnership {
  const site = bareHost(new URL(companySiteUrl).hostname);
  const $ = cheerio.load(html);

  const websites = [
    ...$(WEBSITE_LINKS)
      .map((_, element) => $(element).attr("href") ?? "")
      .get(),
    ...[...html.matchAll(ASHBY_WEBSITE)].map((match) => match[1] ?? ""),
  ]
    .map(hostOf)
    .filter((host): host is string => host !== null);

  const links = $("a[href]")
    .map((_, element) => hostOf($(element).attr("href") ?? ""))
    .get()
    .filter((host): host is string => host !== null);

  if ([...links, ...websites].some((host) => isSameSite(host, site))) {
    return { kind: "confirmed" };
  }

  const other = websites.find((host) => !isPlatform(host));
  return other === undefined
    ? { kind: "unknown" }
    : { kind: "other", site: other };
}

/** The host of an absolute http(s) address without `www.`, or `null`. */
function hostOf(address: string): string | null {
  try {
    const url = new URL(address);
    return url.protocol === "http:" || url.protocol === "https:"
      ? bareHost(url.hostname)
      : null;
  } catch {
    return null;
  }
}

function bareHost(host: string): string {
  return host.startsWith("www.") ? host.slice(4) : host;
}

function isSameSite(host: string, site: string): boolean {
  return (
    host === site || host.endsWith(`.${site}`) || site.endsWith(`.${host}`)
  );
}

function isPlatform(host: string): boolean {
  return PLATFORM_DOMAINS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}
