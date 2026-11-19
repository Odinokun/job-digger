/**
 * Дані для інтеграційних тестів черги: джерело, компанія для пошуку, запуск,
 * завдання.
 */
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  careerSources,
  checkRuns,
  checkTasks,
  companies,
} from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";

/** Компанія з одним джерелом Greenhouse - повертає id джерела. */
export async function greenhouseSource(
  db: NodePgDatabase,
  board: string,
): Promise<string> {
  const user = await seedSystemUser(db);
  const [company] = await db
    .insert(companies)
    .values({ userId: user.id, name: board, url: null, normalizedUrl: null })
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

/** Активний запуск системного користувача - повертає його id. */
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

/** Компанія без джерел із сайтом `{slug}.example` - повертає її id. */
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

/** Завдання для джерела чи компанії - повертає його id. */
export async function task(
  db: NodePgDatabase,
  values: Partial<typeof checkTasks.$inferInsert>,
): Promise<string> {
  const [row] = await db.insert(checkTasks).values(values).returning();

  return row.id;
}

/** Момент `minutes` хвилин після `from`. */
export function minutesAfter(from: Date, minutes: number): Date {
  return new Date(from.getTime() + minutes * 60_000);
}
