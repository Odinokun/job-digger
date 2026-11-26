import { and, asc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { sameCompanyName } from "../../lib/companies/name.ts";
import { companies } from "../db/schema.ts";

/** A company in the form the user needs to be told about it. */
export type ConflictingCompany = {
  id: string;
  name: string;
  url: string;
};

/**
 * A company found by name. Apart from `ConflictingCompany`: the name warning
 * catches the same company under another site (card 2.17).
 */
export type NamedCompany = {
  id: string;
  name: string;
  url: string;
};

/**
 * What was found among the user's already added companies.
 *
 * `exact` blocks adding, `same-domain` is only a warning: one domain can host
 * several different companies, for example national versions
 * (src/lib/companies/README.md).
 */
export type CompanyUrlConflict =
  | { kind: "none" }
  | { kind: "exact"; company: ConflictingCompany }
  | { kind: "same-domain"; companies: ConflictingCompany[] };

/**
 * Looks for a conflict for the address the user wants to add.
 *
 * Only this user's companies are searched: data is isolated, so someone else's
 * company with the same address is not a conflict.
 */
export async function findCompanyUrlConflict(
  db: NodePgDatabase,
  { userId, normalizedUrl }: { userId: string; normalizedUrl: string },
): Promise<CompanyUrlConflict> {
  const domain = companyUrlDomain(normalizedUrl);

  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      url: companies.url,
      normalizedUrl: companies.normalizedUrl,
    })
    .from(companies)
    .where(
      and(
        eq(companies.userId, userId),
        // The domain is computed in SQL rather than matched with `like 'bosch.com%'`:
        // otherwise bosch.com.ua would count as the same domain as bosch.com.
        sql`split_part(split_part(${companies.normalizedUrl}, '/', 1), '?', 1) = ${domain}`,
      ),
    )
    // The code sets the order, not the database: the warning lists the domain's
    // companies the same way the company list shows them - by name.
    .orderBy(asc(companies.name));

  const exact = rows.find((row) => row.normalizedUrl === normalizedUrl);

  if (exact) {
    return { kind: "exact", company: withoutNormalizedUrl(exact) };
  }

  if (rows.length > 0) {
    return {
      kind: "same-domain",
      companies: rows.map(withoutNormalizedUrl),
    };
  }

  return { kind: "none" };
}

/** The domain of an address: everything before the first slash or question mark. */
function companyUrlDomain(normalizedUrl: string): string {
  return normalizedUrl.split("/")[0].split("?")[0];
}

function withoutNormalizedUrl({
  id,
  name,
  url,
}: ConflictingCompany & { normalizedUrl: string }): ConflictingCompany {
  return { id, name, url };
}

/**
 * The user's companies with the same name.
 *
 * Appeared together with companies without a site (card 2.17) and stayed: two
 * cards of one company may share no address - sites on different domains
 * (`linear.app` and `linear.io`), different sources. The site and source checks
 * do not see such a pair; only the name is shared.
 *
 * This is **a warning, not a ban**: two different companies may well have the
 * same name, and the decision stays with the user - as with a shared domain.
 *
 * **The comparison runs in code, not in SQL.** The rule ("Rolls-Royce", "Rolls
 * Royce" and "RollsRoyce" are one company) lives in
 * [`lib/companies/name.ts`](../../lib/companies/name.ts) next to the code that
 * displays the name, rather than being duplicated as a `regexp_replace`
 * expression; besides, Postgres POSIX classes treat non-Latin text differently
 * depending on the database locale. The price is reading a few hundred short
 * rows per company added. If the list grows enough for this to be noticeable,
 * we will add a stored column with an index - as we did with addresses.
 */
export async function findCompaniesByName(
  db: NodePgDatabase,
  { userId, name }: { userId: string; name: string },
): Promise<NamedCompany[]> {
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      url: companies.url,
    })
    .from(companies)
    .where(eq(companies.userId, userId))
    // The code sets the order, not the database: the warning lists companies the
    // same way the list shows them.
    .orderBy(asc(companies.name));

  return rows.filter((row) => sameCompanyName(row.name, name));
}
