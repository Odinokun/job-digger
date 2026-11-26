import { normalizeCompanyUrl } from "../../../lib/companies/url.ts";

let nextSite = 0;

/**
 * A company site for direct inserts in tests: `url` and `normalized_url`.
 *
 * Both columns are required (task company-site-required), and tests that do not
 * care about the site only need some unique address: the name plus the call
 * number on the reserved `.example` domain (RFC 2606). The number is there
 * because tests also create two companies with the same name for one user, and
 * the unique index `(user_id, normalized_url)` would not let such sites through.
 */
export function companySiteValues(name: string): {
  url: string;
  normalizedUrl: string;
} {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  nextSite += 1;
  const url = `https://${slug === "" ? "company" : slug}-${nextSite}.example`;
  const normalized = normalizeCompanyUrl(url);

  if (!normalized.ok) {
    throw new Error(`Test company site is unusable: ${url}`);
  }

  return { url, normalizedUrl: normalized.url };
}
