import {
  detectPlatform,
  platformHostSuffix,
  type CareerPlatform,
} from "./platform.ts";
import { companyUrlHost, normalizeCompanyUrl } from "./url.ts";

/** What to put into the Add company modal fields from one pasted address. */
export type CompanyFieldSuggestion = {
  /** The company's main site. Empty if the address does not show it. */
  url: string;
  /** The company name guessed from the address. */
  name: string;
  /** The career page. Empty if the address does not look like one. */
  careerUrl: string;
};

/** We suggest nothing: the address cannot be used. */
const NOTHING: CompanyFieldSuggestion = { url: "", name: "", careerUrl: "" };

/**
 * Suffixes that cannot be a company name on their own.
 *
 * Needed for second-level domains: in `bosch.com.ua` the second-to-last label is
 * `com`, and without this list the company would be called "Com". We do not pull in
 * the full Public Suffix List: it is large and updated separately from us, and the
 * name field is editable - seven suffixes cover practically everything that comes up.
 */
const SECOND_LEVEL_SUFFIXES = ["co", "com", "net", "org", "gov", "edu", "ac"];

/**
 * A path segment that looks like a language code: `de`, `uk`, `en-US`, `de-de`.
 *
 * The form, not the ISO 639-1 list: the list would have to grow to every code and be
 * kept current, for a gain only in rare cases. The heuristic gets `bosch.com/hr`
 * (Croatia or an HR section) wrong, and that is accepted: the field is editable, so a
 * mistake costs one manual fix instead of two.
 */
const LANGUAGE_SEGMENT_PATTERN = /^[a-z]{2}(-[a-z]{2})?$/i;

/**
 * Platforms where the company name is in the subdomain, not in the path:
 * `bosch.wd3.myworkdayjobs.com` and `acme.peopleforce.io` versus
 * `jobs.lever.co/spotify`.
 */
const SUBDOMAIN_SLUG_PLATFORMS: CareerPlatform[] = [
  "workday",
  "peopleforce",
  "breezy",
  "hurma",
  "personio",
  "softgarden",
  "bamboohr",
  "pinpoint",
];

/**
 * Suggestions for the Add company fields, derived from one pasted address.
 *
 * No network requests: everything is visible from the string itself. The real page
 * search (Find pages, stage 5) exists too; this heuristic covers the moment the
 * address is pasted and the cases where the site does not answer, so all fields are
 * editable and a suggestion commits to nothing.
 */
export function suggestCompanyFields(input: string): CompanyFieldSuggestion {
  const normalized = normalizeCompanyUrl(input);

  if (!normalized.ok) {
    return NOTHING;
  }

  const host = companyUrlHost(normalized.url);
  const platform = detectPlatform(normalized.url);

  // An ATS address is a career page, not the company site: `lever.co` is not
  // Spotify's main site, and `spotify.com` cannot be guessed from the slug - it may
  // be `.io` or `.ai`. So the site field stays empty, and the user fills it in (or
  // Find pages does).
  if (platform !== "unsupported") {
    return {
      url: "",
      name: companyNameFromPlatformUrl(normalized.url, host, platform),
      careerUrl: normalized.url,
    };
  }

  // A national version of a site (`bosch.com/de`) is still the main site, not a
  // separate page: the path stays in the site address, because without it
  // `bosch.com` leads to another, global site. This address does not fill the career field.
  if (isNationalSiteUrl(normalized.url, host)) {
    return {
      url: normalized.url,
      name: companyNameFromHost(host),
      careerUrl: "",
    };
  }

  return {
    url: host,
    name: companyNameFromHost(host),
    // Everything after the domain is no longer the main site but a specific page:
    // if the user pasted one, it goes into the career page field, so the path is
    // not lost when the site is cut down to the domain.
    careerUrl: normalized.url === host ? "" : normalized.url,
  };
}

/**
 * The company name from an ATS address: `jobs.lever.co/spotify` - "Spotify".
 *
 * An empty string means the address has no company: `peopleforce.io` itself or
 * `jobs.lever.co` without a slug is a platform page, not a company page.
 */
function companyNameFromPlatformUrl(
  normalizedUrl: string,
  host: string,
  platform: CareerPlatform,
): string {
  // A TalentAdore address has only the company token (`positions/rR1TqSR`), not a
  // name - there is nothing to suggest (task 6.28).
  if (platform === "talentadore") {
    return "";
  }

  const slug =
    platform === "cleverstaff"
      ? cleverstaffAlias(normalizedUrl, host)
      : SUBDOMAIN_SLUG_PLATFORMS.includes(platform)
        ? platformSubdomain(host)
        : firstPathSegment(normalizedUrl, host);

  return slug === "" ? "" : titleCase(slug);
}

/**
 * The company alias from a CleverStaff board: `cleverstaff.net/i/8allocate-vacancies`
 * - `8allocate`. A link to a single vacancy (`/i/vacancy-...`) does not name the
 * company.
 */
function cleverstaffAlias(normalizedUrl: string, host: string): string {
  const page = normalizedUrl.slice(host.length).split("/").filter(Boolean)[1];
  return page?.endsWith("-vacancies")
    ? page.slice(0, -"-vacancies".length)
    : "";
}

/** The first label before the platform suffix: `bosch.wd3.myworkdayjobs.com` - `bosch`. */
function platformSubdomain(host: string): string {
  const suffix = platformHostSuffix(host);

  if (suffix === null || host === suffix) {
    return "";
  }

  // A platform may add its own labels (`wd3` in Workday), so we take the first one:
  // that is the one the company sets.
  return host.slice(0, host.length - suffix.length - 1).split(".")[0];
}

/**
 * Whether the address looks like a national version of a site: `bosch.com/de`,
 * `bosch.com/en-US`.
 *
 * Only the path is looked at: a query does not cancel a national version, because
 * sometimes it is what sets the version (`bosch.com/de?lang=de`).
 */
function isNationalSiteUrl(normalizedUrl: string, host: string): boolean {
  const segments = pathSegments(normalizedUrl, host);

  return segments.length === 1 && LANGUAGE_SEGMENT_PATTERN.test(segments[0]);
}

/** The first path segment: `jobs.lever.co/spotify/jobs` - `spotify`. */
function firstPathSegment(normalizedUrl: string, host: string): string {
  return pathSegments(normalizedUrl, host)[0] ?? "";
}

/** Path segments without empty ones: `bosch.com/de/careers/` - `["de", "careers"]`. */
function pathSegments(normalizedUrl: string, host: string): string[] {
  return normalizedUrl
    .slice(host.length)
    .split("?")[0]
    .split("/")
    .filter((segment) => segment !== "");
}

/** The company name from the host: `about.gitlab.com` - "Gitlab". */
function companyNameFromHost(host: string): string {
  const labels = host.split(".");

  // The second-to-last label: in `bosch.com` it is `bosch`, in `about.gitlab.com`
  // `gitlab`. For a second-level domain the step back repeats.
  let index = labels.length - 2;

  if (index > 0 && SECOND_LEVEL_SUFFIXES.includes(labels[index])) {
    index -= 1;
  }

  return titleCase(labels[index] ?? labels[0]);
}

/** `acme-corp` - «Acme Corp». */
function titleCase(label: string): string {
  return label
    .split(/[-_]+/)
    .filter((word) => word !== "")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}
