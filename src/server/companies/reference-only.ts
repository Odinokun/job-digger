import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { isUuid } from "../../lib/uuid.ts";
import { careerSources, companies } from "../db/schema.ts";

/**
 * The "link only" mark on a page nothing can read (task 6.17).
 *
 * The page stays on the card as a link but does not count as unread: it does
 * not keep the company in Needs attention and is not part of the "N pages not
 * read" badge. Only an `unsupported` page can be marked - a source that is read
 * or failing cannot be hidden this way. The mark is never set automatically: the
 * app does not know whether the site has vacancies that are not in an ATS.
 *
 * `{ ok: false }` means the source does not exist, belongs to someone else, is
 * read by a parser, or the id is not a UUID. The reasons are not told apart: the
 * button exists only in an Unsupported row, so a refusal means the list is
 * stale, and the answer is always the same - reread it.
 */
export async function setSourceReferenceOnly(
  db: NodePgDatabase,
  {
    userId,
    sourceId,
    referenceOnly,
  }: { userId: string; sourceId: string; referenceOnly: boolean },
): Promise<{ ok: boolean }> {
  if (!isUuid(sourceId)) {
    return { ok: false };
  }

  // The subquery checks the owner: the source id comes from the client.
  const ownCompanies = db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.userId, userId));

  const updated = await db
    .update(careerSources)
    .set({ isReferenceOnly: referenceOnly })
    .where(
      and(
        eq(careerSources.id, sourceId),
        eq(careerSources.platform, "unsupported"),
        inArray(careerSources.companyId, ownCompanies),
      ),
    )
    .returning({ id: careerSources.id });

  return { ok: updated.length > 0 };
}
