import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { companies } from "../db/schema.ts";

/** Which company is deleted and who owns it. */
export type DeleteCompanyInput = {
  userId: string;
  companyId: string;
};

/**
 * How deleting ended.
 *
 * `not-found` covers both a missing company and someone else's - as in
 * `updateCompany`: otherwise the answer would hint that such a row exists.
 */
export type DeleteCompanyResult =
  { ok: true } | { ok: false; problem: "not-found" };

/**
 * Deletes a company together with all its career sources.
 *
 * One query without a transaction: `ON DELETE CASCADE` on
 * `career_sources.company_id` (`db/schema.ts`) removes the sources, and the same
 * cascade on `vacancies.source_id` removes the vacancies of a deleted source.
 * History counters live in `check_runs` and stay.
 *
 * The condition on `user_id` is the access check: someone else's row is not
 * deleted and nothing is returned.
 */
export async function deleteCompany(
  db: NodePgDatabase,
  { userId, companyId }: DeleteCompanyInput,
): Promise<DeleteCompanyResult> {
  const [deleted] = await db
    .delete(companies)
    .where(and(eq(companies.id, companyId), eq(companies.userId, userId)))
    .returning({ id: companies.id });

  return deleted ? { ok: true } : { ok: false, problem: "not-found" };
}
