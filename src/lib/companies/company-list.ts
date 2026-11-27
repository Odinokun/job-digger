import type { CareerPlatform } from "./platform";

/**
 * Types and pure logic of the company list.
 *
 * They live in `src/lib`, not next to the queries in `src/server/companies/list.ts`,
 * because the company list is a client component (it accumulates Load more pages),
 * and server modules are not imported into the client. The same move as with the
 * platform list in [`platform.ts`](./platform.ts).
 */

/**
 * Company states on the Not tracked tab.
 *
 * The list is here, and `pgEnum("discovery_status")` is built from it: otherwise
 * the same values would live in two places and drift apart.
 */
export const DISCOVERY_STATUSES = [
  "not_checked",
  "not_found",
  "unsupported",
  "check_failed",
  // A board was found only by name and does not lead to the company site: Find new
  // pages does not add it, and the user confirms it through Find pages (task 5.10).
  "possible_page",
] as const;

export type DiscoveryStatus = (typeof DISCOVERY_STATUSES)[number];

/**
 * Tabs of the Companies page. `attention` is Needs attention (task 6.11): a slice
 * over the other two, and a company in it stays in its Tracked or Not tracked too.
 * `all` is all of the user's companies, with search by name (task
 * companies-search).
 */
export const COMPANIES_TABS = [
  "tracked",
  "not-tracked",
  "attention",
  "all",
] as const;

/**
 * Tab membership is not stored in the database: Tracked means "at least one source
 * is tracked", Needs attention is a rule in `src/server/companies/list.ts`
 * (`needsAttentionSubquery`).
 */
export type CompaniesTab = (typeof COMPANIES_TABS)[number];

export type CompanySource = {
  id: string;
  url: string;
  /**
   * The label the user tells sources of one site apart by, or `null` if there is
   * no label: the address speaks for itself.
   */
  label: string | null;
  platform: CareerPlatform;
  isTracked: boolean;
  /**
   * The person marked a page nothing can read as "link only" (task 6.17): it does
   * not count as unread.
   */
  isReferenceOnly: boolean;
  /**
   * How the source's last check ended: `null` means not checked yet. A failed one
   * is `consecutive_failures > 0`.
   */
  lastCheck: "ok" | "failed" | null;
  /**
   * The last successful check - "Last ok: 12 days ago" next to a failed source:
   * vacancies are not deleted after a failure, and without this date stale ones
   * cannot be told from live ones.
   */
  lastSuccessAt: Date | null;
  /** The source is in the queue: its task is waiting or running. */
  isChecking: boolean;
};

export type CompanyListItem = {
  id: string;
  name: string;
  /** The main site - required (task company-site-required). */
  url: string;
  discoveryStatus: DiscoveryStatus;
  sources: CompanySource[];
  /**
   * Vacancies of all the company's sources: how many in total and how many of them
   * in Favorites. The delete dialog names them - they go together with the company.
   */
  vacancies: { total: number; favorites: number };
  /**
   * The last check among the company's sources, successful or not, or `null` if
   * none has been checked yet. The card shows it relatively ("Last checked: 5 min
   * ago").
   */
  lastCheckedAt: Date | null;
};

/**
 * Whether the All tab search would find a company with this name - the same rule
 * as in the list query (`src/server/companies/list.ts`): the name contains the
 * search string, ignoring case, and an empty string finds everything. The client
 * needs it: a row added or changed during a search stays in the shown list only if
 * it matches the search.
 */
export function matchesCompanySearch(name: string, query: string): boolean {
  const text = query.trim().toLowerCase();

  return text === "" || name.toLowerCase().includes(text);
}

/**
 * The tab from an untrusted value: an address parameter or a Server Action
 * argument.
 *
 * Anything unknown is Tracked, because it opens by default: a mistake in the address
 * should show the ordinary list, not emptiness or an error.
 */
export function parseCompaniesTab(value: unknown): CompaniesTab {
  return typeof value === "string" &&
    (COMPANIES_TABS as readonly string[]).includes(value)
    ? (value as CompaniesTab)
    : "tracked";
}

/**
 * The order of list rows: the same as the query sets (`order by name, id`).
 *
 * Needed on the client when a renamed company comes back from the server and has to
 * take its place among the rows already shown, without rereading the list.
 *
 * `localeCompare` matches the database order: the database was created with
 * `en_US.utf8`, where "acme" comes before "Bosch", not after it as a byte-wise
 * comparison would put it. They are identical only as long as the database keeps this
 * locale; the next read from the server sets the exact order in any case.
 */
export function compareCompanyRows(
  left: CompanyListItem,
  right: CompanyListItem,
): number {
  const byName = left.name.localeCompare(right.name, "en");

  return byName === 0 ? left.id.localeCompare(right.id) : byName;
}

/**
 * A company is tracked if at least one of its sources is tracked - the same rule
 * that splits the Tracked and Not tracked tabs. Needed on the Needs attention tab,
 * where both are mixed: the company, not the tab, decides the card's actions.
 */
export function isTrackedCompany(sources: CompanySource[]): boolean {
  return sources.some((source) => source.isTracked);
}

/**
 * A page we do not read and the person has not marked "link only" (tasks 6.11 and
 * 6.17). The same rule for the database is `needsAttentionSubquery` in
 * `src/server/companies/list.ts`.
 */
export function isNotReadSource(source: CompanySource): boolean {
  return source.platform === "unsupported" && !source.isReferenceOnly;
}

/**
 * How many of the company's pages we do not read - the "N pages not read" badge
 * (task 6.11). Unsupported is a permanent state, not a failure, so it is a separate
 * attention badge rather than Has errors.
 */
export function notReadSourceCount(sources: CompanySource[]): number {
  return sources.filter(isNotReadSource).length;
}
