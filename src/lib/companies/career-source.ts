import { detectPlatform, type CareerPlatform } from "./platform.ts";
import {
  absoluteCompanyUrl,
  normalizeCompanyUrl,
  type UrlRefusalReason,
} from "./url.ts";

/** What the user entered in the "add a career page" field. */
export type CareerSourceInput = {
  url: string;
  /** The label the user tells sources of one site apart by. Optional. */
  label?: string;
  /**
   * The addresses of the sources the company already has, as they are in the
   * database. A duplicate is looked for only among them: the same source in another
   * company is not a duplicate (`src/server/db/README.md`).
   */
  existingUrls: string[];
};

/** A source ready to insert - already with its platform and tracking. */
export type PreparedCareerSource = {
  ok: true;
  /** The address in absolute form: this is what is stored and becomes the link. */
  url: string;
  /**
   * The same address in normalized form. Returned because
   * `career_sources.normalized_url` stores it: the comparison with other companies'
   * sources is done by a query, not in memory (card 2.17).
   */
  normalizedUrl: string;
  label: string | null;
  platform: CareerPlatform;
  isTracked: boolean;
};

/**
 * Why the address cannot be added as a source.
 *
 * `duplicate` carries no address: the modal shows what the user has just entered, and
 * the twin source is visible in the list above anyway.
 */
export type CareerSourceRefusal =
  | { ok: false; problem: "url"; reason: UrlRefusalReason }
  | { ok: false; problem: "duplicate" };

export type CareerSourceResult = PreparedCareerSource | CareerSourceRefusal;

/**
 * Prepares a career source for insertion: normalizes the address, catches a
 * duplicate within the company and derives the platform.
 *
 * A pure function in `src/lib`, not part of a query: both the Edit modal and the
 * offer in Add company (card 2.16) need it, and the deduplication rule has to live
 * in one place.
 *
 * **A duplicate is a match of normalized addresses.** `https://www.mozilla.org/careers/`
 * and `mozilla.org/careers` are the same source, while two links that differ only in
 * `query` are different: `normalizeCompanyUrl` keeps the `query` precisely because it
 * tells page filters and national versions apart.
 *
 * The database has no uniqueness here on purpose (`career_sources` without a unique
 * index), so the check is friendly, not atomic: two simultaneous Saves could in
 * theory add a duplicate source, and the Remove button cleans it up. The price of
 * the mistake is a row in the list, not lost data.
 */
export function prepareCareerSource({
  url,
  label,
  existingUrls,
}: CareerSourceInput): CareerSourceResult {
  const typed = url.trim();
  const normalized = normalizeCompanyUrl(typed);

  if (!normalized.ok) {
    return { ok: false, problem: "url", reason: normalized.reason };
  }

  const taken = existingUrls.some((existing) => {
    const normalizedExisting = normalizeCompanyUrl(existing);

    // Addresses from the database are not checked again: an unusable one cannot get
    // there, and if it did, it simply matches nothing.
    return normalizedExisting.ok && normalizedExisting.url === normalized.url;
  });

  if (taken) {
    return { ok: false, problem: "duplicate" };
  }

  const platform = detectPlatform(normalized.url);
  const trimmedLabel = label?.trim() ?? "";

  return {
    ok: true,
    url: absoluteCompanyUrl(typed),
    normalizedUrl: normalized.url,
    // An empty label is "no label", not an empty string in the database.
    label: trimmedLabel === "" ? null : trimmedLabel,
    platform,
    // A page nothing can read is saved without tracking.
    isTracked: platform !== "unsupported",
  };
}
