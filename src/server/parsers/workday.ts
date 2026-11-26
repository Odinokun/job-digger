/**
 * The Workday parser: vacancies from the API the Workday career site itself uses
 * (`/wday/cxs/{tenant}/{site}/jobs`). This API has no public documentation -
 * everything here was checked with real requests (the README next to this file, "Workday").
 */
import type { HttpClient } from "../http/client.ts";
import {
  collectVacancies,
  isRecord,
  postJson,
  UNREADABLE,
  type ReadVacancy,
} from "./shared.ts";
import { pagesToRead, type ReadDepth } from "./vacancies-to-check.ts";
import type { ParsedVacancy, ParseResult } from "./types.ts";

/** Where to go for a site's vacancies and what to build their links from. */
export interface WorkdaySite {
  /** The vacancy list address; the POST goes to it. */
  api: string;
  /** The career site address; a vacancy link is it plus `externalPath`. */
  jobBase: string;
}

/** A language segment at the start of the path: `en-US`, `de-DE`. */
const LOCALE = /^[a-z]{2}-[A-Z]{2}$/;

/**
 * The Workday site from a source address, or `null` if the address is not a
 * Workday career site. Two formats (`src/lib/companies/platform.ts`):
 *
 * - `{tenant}.wd5.myworkdayjobs.com/{site}` - the tenant in the subdomain;
 * - `wd5.myworkdaysite.com/recruiting/{tenant}/{site}` - the tenant in the path.
 *
 * A language segment (`/en-US/...`) is skipped, and so is the tail after the site
 * name (a vacancy link).
 */
export function workdaySite(sourceUrl: string): WorkdaySite | null {
  let url: URL;

  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const path = LOCALE.test(segments[0] ?? "") ? segments.slice(1) : segments;
  const labels = url.hostname.split(".");
  const origin = `https://${url.hostname}`;

  if (url.hostname.endsWith(".myworkdayjobs.com") && labels.length > 3) {
    const [tenant] = labels;
    const [site] = path;

    return tenant === undefined || site === undefined
      ? null
      : siteOf(origin, tenant, site, `${origin}/${site}`);
  }

  if (url.hostname.endsWith(".myworkdaysite.com") && path[0] === "recruiting") {
    const [, tenant, site] = path;

    return tenant === undefined || site === undefined
      ? null
      : siteOf(origin, tenant, site, `${origin}/recruiting/${tenant}/${site}`);
  }

  return null;
}

function siteOf(
  origin: string,
  tenant: string,
  site: string,
  jobBase: string,
): WorkdaySite {
  return {
    api: `${origin}/wday/cxs/${tenant}/${site}/jobs`,
    jobBase,
  };
}

/**
 * Vacancies from the response to a POST to `.../jobs` - an object with a
 * `jobPostings` array.
 *
 * `externalId` is `externalPath` (`/job/Poland-Warsaw/Engineer_JR1`): the list
 * gives no separate ID, and the requisition number from `bulletFields` is not
 * unique - one requisition may have several postings (`..._JR2028965-1`). The
 * link is `jobBase` plus the same path, the location is `locationsText` as it is
 * (it can be "2 Locations": only a separate request per vacancy gives all locations).
 */
export function parseWorkdayJobs(
  answer: unknown,
  jobBase: string,
): ParseResult {
  if (!isRecord(answer) || !Array.isArray(answer.jobPostings)) {
    return UNREADABLE;
  }

  return collectVacancies(answer.jobPostings, readerFor(jobBase));
}

function readerFor(jobBase: string): ReadVacancy {
  return ({ title, externalPath, locationsText }) => {
    if (
      typeof title !== "string" ||
      typeof externalPath !== "string" ||
      !externalPath.startsWith("/")
    ) {
      return "broken";
    }

    if (title.trim() === "") {
      return "skip";
    }

    const location =
      typeof locationsText === "string" ? locationsText.trim() : "";

    return {
      externalId: externalPath,
      title: title.trim(),
      url: `${jobBase}${externalPath}`,
      location: location === "" ? null : location,
    };
  };
}

/**
 * How many vacancies to ask for at once. This is the most Workday accepts: for
 * `limit: 50` it answers 400 (checked on NVIDIA 18.11.2026).
 */
export const WORKDAY_PAGE_SIZE = 20;

/**
 * Vacancies of a career source on Workday: the site from the address, list pages
 * through POST (`offset`/`limit`) and parsing of each. A non-Workday address is
 * `unreadable` without any request.
 *
 * The end of the list comes from the first page's `total` or from an incomplete
 * page. Simply "asking until an empty one arrives" does not work: on later pages
 * `total` is 0, and from an `offset` of 2000 Workday serves the first page again.
 *
 * A failure of any page is a failure of the whole source, as in Lever.
 */
export async function readWorkday(
  sourceUrl: string,
  client: HttpClient,
  {
    depth = "full",
    maxPages = pagesToRead({ pageSize: WORKDAY_PAGE_SIZE, depth }),
  }: { depth?: ReadDepth; maxPages?: number } = {},
): Promise<ParseResult> {
  const site = workdaySite(sourceUrl);

  if (site === null) {
    return UNREADABLE;
  }

  const vacancies: ParsedVacancy[] = [];
  let skipped = 0;
  let total = Infinity;
  // Becomes `false` only when the list ended by itself, not at the limit.
  let truncated = true;

  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * WORKDAY_PAGE_SIZE;
    const fetched = await postJson(client, site.api, {
      appliedFacets: {},
      limit: WORKDAY_PAGE_SIZE,
      offset,
      searchText: "",
    });

    if (!fetched.ok) {
      return fetched;
    }

    const parsed = parseWorkdayJobs(fetched.answer, site.jobBase);

    if (!parsed.ok) {
      return parsed;
    }

    vacancies.push(...parsed.vacancies);
    skipped += parsed.skipped;

    if (page === 0 && isRecord(fetched.answer)) {
      const { total: first } = fetched.answer;
      total = typeof first === "number" ? first : Infinity;
    }

    // Skipped records took up room on the page too.
    const read = parsed.vacancies.length + parsed.skipped;

    if (read < WORKDAY_PAGE_SIZE || offset + read >= total) {
      truncated = false;
      break;
    }
  }

  return truncated
    ? { ok: true, vacancies, skipped, truncated: true }
    : { ok: true, vacancies, skipped };
}
