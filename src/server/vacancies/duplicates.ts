/**
 * Vacancy duplicates across the sources of one company (task 6.20): the same
 * vacancy on an ATS, on an aggregator and on the company site. A duplicate is not
 * dropped but stored as read - it is not in Unread, the counter or "N new
 * vacancies". The rules and decisions are in the README.md next to this file,
 * section "Duplicates across sources".
 *
 * Here is the pure part: which of the duplicates becomes read. Finding matches and
 * writing are in `lifecycle.ts`.
 */
import type { CareerPlatform } from "../../lib/companies/platform.ts";

/**
 * A platform is an ATS or an aggregator (PeopleForce, DOU…), a site is the
 * company's own page. Platforms win: they are "more flexible and more alive" in
 * how they present vacancies.
 */
export type SourceKind = "platform" | "site";

/**
 * Platforms that read the company's own site rather than an ATS: schema.org
 * `JobPosting` (task 3.11) and the recipe page (task 6.21).
 */
const SITE_PLATFORMS: ReadonlySet<CareerPlatform> = new Set([
  "schema_org",
  "own_page",
]);

export function sourceKind(platform: CareerPlatform): SourceKind {
  return SITE_PLATFORMS.has(platform) ? "site" : "platform";
}

/**
 * A match: the freshly discovered vacancy `newId` has the same title as the active
 * vacancy `otherId` from another source of the same company.
 */
export interface DuplicateMatch {
  newId: string;
  otherId: string;
  otherKind: SourceKind;
  otherIsRead: boolean;
}

/** What to mark read: new vacancies and existing ones that give way to new ones. */
export interface DuplicateDecision {
  readNew: string[];
  readOthers: string[];
}

/**
 * The later duplicate becomes read. The exception is the platform's priority: a
 * new vacancy from a platform whose duplicates are only on sites, with at least one
 * unread, stays unread, and the unread site ones become read. If all the site ones
 * are already read, the user has seen the vacancy - the new one is read too.
 *
 * `kind` is the kind of source the new vacancies came from.
 */
export function resolveDuplicates(
  kind: SourceKind,
  matches: DuplicateMatch[],
): DuplicateDecision {
  const byNew = new Map<string, DuplicateMatch[]>();
  for (const found of matches) {
    byNew.set(found.newId, [...(byNew.get(found.newId) ?? []), found]);
  }

  const decision: DuplicateDecision = { readNew: [], readOthers: [] };

  for (const [newId, others] of byNew) {
    const unreadSites = others.filter(
      (other) => other.otherKind === "site" && !other.otherIsRead,
    );
    const winsOverSite =
      kind === "platform" &&
      others.every((other) => other.otherKind === "site") &&
      unreadSites.length > 0;

    if (winsOverSite) {
      decision.readOthers.push(...unreadSites.map((other) => other.otherId));
    } else {
      decision.readNew.push(newId);
    }
  }

  return decision;
}
