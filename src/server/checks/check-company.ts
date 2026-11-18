/**
 * Check now для однієї компанії (docs/ui.md, розділ 4.2): читає всі її джерела,
 * що відстежуються, і застосовує життєвий цикл вакансій. Поки без черги - її
 * робить етап 4; в History ця перевірка не записується.
 */
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { careerSources, companies } from "../db/schema.ts";
import type { HttpClient } from "../http/client.ts";
import { readSource } from "../parsers/read-source.ts";
import { syncSourceVacancies } from "../vacancies/lifecycle.ts";

export interface CheckCompanyInput {
  userId: string;
  companyId: string;
  /** Момент перевірки - спільний для всіх джерел компанії. */
  checkedAt: Date;
}

export type CheckCompanyResult =
  { ok: true } | { ok: false; reason: "not-found" };

export async function checkCompany(
  db: NodePgDatabase,
  client: HttpClient,
  { userId, companyId, checkedAt }: CheckCompanyInput,
): Promise<CheckCompanyResult> {
  const [company] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.userId, userId)));

  if (company === undefined) {
    return { ok: false, reason: "not-found" };
  }

  const sources = await db
    .select({
      id: careerSources.id,
      url: careerSources.url,
      platform: careerSources.platform,
    })
    .from(careerSources)
    .where(
      and(
        eq(careerSources.companyId, companyId),
        eq(careerSources.isTracked, true),
      ),
    );

  // Джерела читаються одночасно: ввічливість до сайтів тримає сам HTTP-клієнт
  // (два запити на хост, пауза між стартами), а не порядок тут.
  await Promise.all(
    sources.map((source) => checkSource(db, client, source, checkedAt)),
  );

  return { ok: true };
}

async function checkSource(
  db: NodePgDatabase,
  client: HttpClient,
  source: {
    id: string;
    url: string;
    platform: (typeof careerSources.$inferSelect)["platform"];
  },
  checkedAt: Date,
): Promise<void> {
  const result = await readSource(source, client);

  if (result === null) {
    return;
  }

  await syncSourceVacancies(db, { sourceId: source.id, result, checkedAt });

  await db
    .update(careerSources)
    .set(
      result.ok
        ? {
            lastCheckedAt: checkedAt,
            lastSuccessAt: checkedAt,
            consecutiveFailures: 0,
          }
        : {
            lastCheckedAt: checkedAt,
            consecutiveFailures: sql`${careerSources.consecutiveFailures} + 1`,
          },
    )
    .where(eq(careerSources.id, source.id));
}
