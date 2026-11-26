import { and, eq, inArray, ne } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { normalizeCompanyUrl } from "../../lib/companies/url.ts";
import { careerSources, companies } from "../db/schema.ts";

/** The company to name in a refusal: no larger interface is needed. */
export type CompanyWithSource = {
  id: string;
  name: string;
};

export type FindCompanyWithSourceInput = {
  userId: string;
  /** The normalized source address - the same form as in `normalized_url`. */
  normalizedUrl: string;
  /**
   * The company the source is being added to. Its own sources are not duplicates
   * *between* companies: `prepareCareerSource` catches those and words it differently.
   */
  exceptCompanyId?: string;
};

/**
 * The company of the same user that already has this career source, or `null`.
 *
 * The same company may come under another site (`spotify.com` and `spotify.se`):
 * then the site check does not recognise it, and adding `jobs.lever.co/spotify`
 * a second time would give two "Spotify" cards with double checks. Appeared
 * together with companies without a site (card 2.17).
 *
 * **The check is friendly, not atomic.** There is no unique index on sources:
 * `career_sources` has no `user_id`, and uniqueness within a user cannot be
 * expressed by one index on one table - PostgreSQL has no unique across a join.
 * We did not denormalise `user_id` for this: the price is a column, a composite
 * FK and an index, and it buys atomicity against a race of "two simultaneous
 * Saves", which costs one extra row that the Remove button cleans up. The same
 * decision was already made for duplicates within a company
 * ([`lib/companies/career-source.ts`](../../lib/companies/career-source.ts)).
 *
 * The call runs inside the transaction of whoever inserts the source: between
 * the check and the insert the company could be deleted.
 *
 * The query goes through `companies` with a condition on the user:
 * `career_sources` does not store the owner, and without this condition the
 * refusal would tell about someone else's company.
 */
export async function findCompanyWithSource(
  db: NodePgDatabase,
  { userId, normalizedUrl, exceptCompanyId }: FindCompanyWithSourceInput,
): Promise<CompanyWithSource | null> {
  const [row] = await db
    .select({ id: companies.id, name: companies.name })
    .from(careerSources)
    .innerJoin(companies, eq(careerSources.companyId, companies.id))
    .where(
      and(
        eq(companies.userId, userId),
        eq(careerSources.normalizedUrl, normalizedUrl),
        exceptCompanyId === undefined
          ? undefined
          : ne(companies.id, exceptCompanyId),
      ),
    )
    .limit(1);

  return row ?? null;
}

export type FindCompaniesWithSourcesInput = {
  userId: string;
  /** Addresses as they are, for example Find pages findings: normalized here. */
  urls: string[];
};

/**
 * For every address that is already a source of one of the user's companies,
 * that company (task 5.08: "already tracked in ..." in the list of findings).
 *
 * The key is the address as it was passed, not the normalized one: the caller
 * looks the finding up by it. One query for the whole list instead of
 * `findCompanyWithSource` per address. An unusable address simply has no
 * match - it cannot be a source.
 */
export async function findCompaniesWithSources(
  db: NodePgDatabase,
  { userId, urls }: FindCompaniesWithSourcesInput,
): Promise<Map<string, CompanyWithSource>> {
  const byNormalized = new Map<string, string[]>();
  for (const url of urls) {
    const normalized = normalizeCompanyUrl(url);
    if (normalized.ok) {
      byNormalized.set(normalized.url, [
        ...(byNormalized.get(normalized.url) ?? []),
        url,
      ]);
    }
  }

  const found = new Map<string, CompanyWithSource>();
  if (byNormalized.size === 0) {
    return found;
  }

  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      normalizedUrl: careerSources.normalizedUrl,
    })
    .from(careerSources)
    .innerJoin(companies, eq(careerSources.companyId, companies.id))
    .where(
      and(
        eq(companies.userId, userId),
        inArray(careerSources.normalizedUrl, [...byNormalized.keys()]),
      ),
    );

  for (const { id, name, normalizedUrl } of rows) {
    for (const url of byNormalized.get(normalizedUrl) ?? []) {
      found.set(url, { id, name });
    }
  }

  return found;
}
