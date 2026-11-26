import { normalizeCompanyUrl } from "../../../lib/companies/url.ts";

/**
 * A normalized address for directly inserting a career source in tests.
 *
 * `career_sources.normalized_url` is always filled in, and in the app
 * `prepareCareerSource` does it. Tests insert rows around it - as fixtures, not
 * to check the rule - so they need the same computation without the rest of
 * the source preparation.
 *
 * Writing the normalized form by hand in every test is not an option: the
 * normalization rule would then live both in code and in a dozen literals, and
 * they would drift apart at the first change.
 *
 * An unusable address here is a bug in the test itself, hence an exception.
 */
export function normalizedSourceUrl(url: string): string {
  const normalized = normalizeCompanyUrl(url);

  if (!normalized.ok) {
    throw new Error(`Test career source url is unusable: ${url}`);
  }

  return normalized.url;
}
