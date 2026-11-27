import { companyUrlHost } from "./url.ts";

/**
 * Career source platforms: the platform selects the parser.
 *
 * The list lives here, not in the database schema, because the client needs it too,
 * and from the schema it would come together with Drizzle. The `career_platform`
 * enum is built from this array - the values and their order in the database and
 * in the code cannot drift apart.
 *
 * `own_page` is a company's own career page read by a recipe (task 6.21): a person
 * confirmed which links on it are vacancies. It cannot be recognised by address, so
 * `detectPlatform` never returns it.
 *
 * `unsupported` means the page was found but nothing can read it
 * (src/server/parsers/README.md).
 */
export const CAREER_PLATFORMS = [
  "greenhouse",
  "lever",
  "ashby",
  "workday",
  "peopleforce",
  "breezy",
  "cleverstaff",
  "hurma",
  "personio",
  "softgarden",
  "workable",
  "bamboohr",
  "pinpoint",
  "talentadore",
  "schema_org",
  "own_page",
  "unsupported",
] as const;

/** The career source platform as the database stores it. */
export type CareerPlatform = (typeof CAREER_PLATFORMS)[number];

/**
 * Platform domains. The key is a host suffix, the value is a platform.
 *
 * The list is short on purpose: it holds only the hosts the platform itself gives
 * out. An ATS customer's custom domain (`jobs.company.com`) does not get here - the
 * address says nothing about it.
 *
 * - `greenhouse.io` - the official documentation describes `boards.greenhouse.io`
 *   (support.greenhouse.io/hc/en-us/articles/360020776251); the newer
 *   `job-boards.greenhouse.io` is not officially documented but serves the same
 *   boards, so the suffix covers both.
 * - `lever.co` - Lever's public Postings API works with the `jobs.lever.co` and
 *   `jobs.eu.lever.co` hosts (github.com/lever/postings-api).
 * - `myworkdayjobs.com` and `myworkdaysite.com` - two Workday career site formats.
 * - `peopleforce.io` - the PeopleForce career site lives on its own subdomain.
 * - `breezy.hr` - the Breezy HR board is on the company's subdomain too (task 3.24).
 * - `cleverstaff.net` - the CleverStaff board is on the platform's own host,
 *   `cleverstaff.net/i/{alias}-vacancies` (task 3.25).
 * - `hurma.work` - the public Hurma vacancies page on the company's subdomain,
 *   `{company}.hurma.work/public-vacancies` (task 3.26).
 * - `jobs.personio.de` and `jobs.personio.com` - the Personio board on the company's
 *   subdomain (developer.personio.de/docs/retrieving-open-job-positions; `.com`
 *   serves the same - task 3.27). `personio.de`/`.com` itself is the vendor's site.
 * - `softgarden.io` (the old board) and `career.softgarden.de` (the new career
 *   site) - two softgarden products, both on the company's subdomain (task 3.28).
 *   The rest of `softgarden.de` (`static.`, the site) are not boards.
 * - `workable.com` - the career page `apply.workable.com/{account}` and the old
 *   `{account}.workable.com` format (task 6.25).
 * - `bamboohr.com` - the BambooHR career page on the company's subdomain,
 *   `{company}.bamboohr.com/careers` (task 6.26).
 * - `pinpointhq.com` - the Pinpoint career page on the company's subdomain
 *   (task 6.27).
 * - `ats.talentadore.com` - the TalentAdore vacancies JSON, `positions/{token}/json`
 *   (task 6.28). `talentadore.com` itself is the vendor's site.
 */
const PLATFORM_DOMAINS: Array<[suffix: string, platform: CareerPlatform]> = [
  ["greenhouse.io", "greenhouse"],
  ["lever.co", "lever"],
  ["ashbyhq.com", "ashby"],
  ["myworkdayjobs.com", "workday"],
  ["myworkdaysite.com", "workday"],
  ["peopleforce.io", "peopleforce"],
  ["breezy.hr", "breezy"],
  ["cleverstaff.net", "cleverstaff"],
  ["hurma.work", "hurma"],
  ["jobs.personio.de", "personio"],
  ["jobs.personio.com", "personio"],
  ["softgarden.io", "softgarden"],
  ["career.softgarden.de", "softgarden"],
  ["workable.com", "workable"],
  ["bamboohr.com", "bamboohr"],
  ["pinpointhq.com", "pinpoint"],
  ["ats.talentadore.com", "talentadore"],
];

/**
 * The source platform derived from its address.
 *
 * Accepts a **normalized** address - the form `normalizeCompanyUrl` returns (no
 * protocol, the host in lower case). That is why there is neither URL parsing nor
 * handling of broken input here: validation happened a step earlier.
 *
 * An unknown host is `unsupported`: until a trial request has read the page, there is
 * no reason to consider it readable. The function never returns `schema_org` -
 * JobPosting markup is visible only from the page content.
 */
export function detectPlatform(normalizedUrl: string): CareerPlatform {
  return matchPlatformDomain(normalizedUrl)?.[1] ?? "unsupported";
}

/**
 * The host suffix the platform was recognised by, or `null` for an unknown host.
 *
 * Needed where the part the platform itself added has to be taken out of the
 * address: in `bosch.wd3.myworkdayjobs.com` the suffix is `myworkdayjobs.com`, and
 * everything before it belongs to the company (`suggest.ts`).
 */
export function platformHostSuffix(normalizedUrl: string): string | null {
  return matchPlatformDomain(normalizedUrl)?.[0] ?? null;
}

/** The `PLATFORM_DOMAINS` entry the address host falls under. */
function matchPlatformDomain(
  normalizedUrl: string,
): (typeof PLATFORM_DOMAINS)[number] | undefined {
  const host = companyUrlHost(normalizedUrl);

  return PLATFORM_DOMAINS.find(
    // The domain label boundary is compared, not the end of the string: otherwise
    // `not-greenhouse.io` would count as a Greenhouse board.
    ([suffix]) => host === suffix || host.endsWith(`.${suffix}`),
  );
}
