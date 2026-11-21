/**
 * Check now для однієї компанії (docs/ui.md, розділ 4.2): читає всі її джерела,
 * що відстежуються, і застосовує життєвий цикл вакансій. Поки без черги - її
 * робить етап 4; в History ця перевірка не записується.
 */
import { and, eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { careerSources, checkRuns, companies } from "../db/schema.ts";
import type { HttpClient } from "../http/client.ts";
import { checkSource } from "./check-source.ts";

export interface CheckCompanyInput {
  userId: string;
  companyId: string;
  /** Момент перевірки - спільний для всіх джерел компанії. */
  checkedAt: Date;
}

export type CheckCompanyResult =
  { ok: true } | { ok: false; reason: "not-found" | "check-running" };

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

  // Під час загальної перевірки компанія і так перевіряється - дублікатів
  // не створюємо (src/server/checks/README.md). Кнопка в цей час
  // вимкнена, а це - захист від запиту, що прийшов уже після старту.
  const [activeRun] = await db
    .select({ id: checkRuns.id })
    .from(checkRuns)
    .where(and(eq(checkRuns.userId, userId), isNull(checkRuns.finishedAt)));

  if (activeRun !== undefined) {
    return { ok: false, reason: "check-running" };
  }

  const sources = await db
    .select({
      id: careerSources.id,
      url: careerSources.url,
      platform: careerSources.platform,
      vacancyLinkPrefix: careerSources.vacancyLinkPrefix,
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
