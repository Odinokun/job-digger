/**
 * Data for the queue's integration tests: a source, a company for search, a run,
 * tasks.
 */
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  careerSources,
  checkRuns,
  checkTasks,
  companies,
} from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { companySiteValues } from "../db/testing/company-values.ts";

/** A company with one Greenhouse source - returns the source id. */
export async function greenhouseSource(
  db: NodePgDatabase,
  board: string,
): Promise<string> {
  const user = await seedSystemUser(db);
  const [company] = await db
    .insert(companies)
    .values({ userId: user.id, name: board, ...companySiteValues(board) })
    .returning();
  const [source] = await db
    .insert(careerSources)
    .values({
      companyId: company.id,
      url: `https://job-boards.greenhouse.io/${board}`,
      normalizedUrl: `job-boards.greenhouse.io/${board}`,
      platform: "greenhouse",
    })
    .returning();

  return source.id;
}

/** An active run of the system user - returns its id. */
export async function activeRun(
  db: NodePgDatabase,
  values: Partial<typeof checkRuns.$inferInsert> = {},
): Promise<string> {
  const user = await seedSystemUser(db);
  const [run] = await db
    .insert(checkRuns)
    .values({ userId: user.id, ...values })
    .returning();

  return run.id;
}

/** A company without sources with the site `{slug}.example` - returns its id. */
export async function companyToDiscover(
  db: NodePgDatabase,
  name: string,
  slug = name.toLowerCase(),
): Promise<string> {
  const user = await seedSystemUser(db);
  const [company] = await db
    .insert(companies)
    .values({
      userId: user.id,
      name,
      url: `https://${slug}.example`,
      normalizedUrl: `${slug}.example`,
    })
    .returning();

  return company.id;
}

/** A task for a source or a company - returns its id. */
export async function task(
  db: NodePgDatabase,
  values: Partial<typeof checkTasks.$inferInsert>,
): Promise<string> {
  const [row] = await db.insert(checkTasks).values(values).returning();

  return row.id;
}

/** The moment `minutes` minutes after `from`. */
export function minutesAfter(from: Date, minutes: number): Date {
  return new Date(from.getTime() + minutes * 60_000);
}
