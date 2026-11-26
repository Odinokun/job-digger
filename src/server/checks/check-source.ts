/**
 * Checking one career source: read it with a parser, apply the vacancy lifecycle
 * and record the source's check state. Shared by Check now (`check-company.ts`)
 * and the queue (`queue/run-task.ts`).
 */
import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { CareerPlatform } from "../../lib/companies/platform.ts";
import { careerSources } from "../db/schema.ts";
import type { HttpClient } from "../http/client.ts";
import { readSource } from "../parsers/read-source.ts";
import type { ParserError } from "../parsers/types.ts";
import type { ReadDepth } from "../parsers/vacancies-to-check.ts";
import { syncSourceVacancies } from "../vacancies/lifecycle.ts";

export interface SourceToCheck {
  id: string;
  url: string;
  platform: CareerPlatform;
  /** The own page's recipe (task 6.21); `null` for other platforms. */
  vacancyLinkPrefix: string | null;
}

/** The outcome of a source check - what the queue records into the task and the run. */
export type SourceCheckOutcome =
  | {
      ok: true;
      newVacancies: number;
      removedVacancies: number;
      /** Records the parser skipped because of bad data - the parse warning. */
      skipped: number;
    }
  | { ok: false; error: ParserError };

/**
 * Checks the source. `null` - the platform has no parser yet: such a source is
 * not checked at all, so its check state does not change either.
 *
 * `depth` is how much to read (task 6.16). A successful read with `full` counts as
 * a full read (`last_full_read_at`), and so does a list that ended by itself even
 * on the first page: for Greenhouse the first page is the whole list.
 */
export async function checkSource(
  db: NodePgDatabase,
  client: HttpClient,
  source: SourceToCheck,
  checkedAt: Date,
  depth: ReadDepth = "full",
): Promise<SourceCheckOutcome | null> {
  const result = await readSource(source, client, depth);

  if (result === null) {
    return null;
  }

  const counts = await syncSourceVacancies(db, {
    sourceId: source.id,
    result,
    checkedAt,
  });

  await db
    .update(careerSources)
    .set(
      result.ok
        ? {
            lastCheckedAt: checkedAt,
            lastSuccessAt: checkedAt,
            consecutiveFailures: 0,
            ...(depth === "full" || !result.truncated
              ? { lastFullReadAt: checkedAt }
              : {}),
          }
        : {
            lastCheckedAt: checkedAt,
            consecutiveFailures: sql`${careerSources.consecutiveFailures} + 1`,
          },
    )
    .where(eq(careerSources.id, source.id));

  return result.ok
    ? { ok: true, ...counts, skipped: result.skipped }
    : { ok: false, error: result.error };
}
