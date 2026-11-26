/**
 * Check now for one company: reads all of its tracked sources and applies the
 * vacancy lifecycle. Synchronous, without the queue (task 6.13 kept it so); this
 * check is not recorded in History.
 */
import { and, eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { careerSources, checkRuns, companies } from "../db/schema.ts";
import type { HttpClient } from "../http/client.ts";
import { checkSource } from "./check-source.ts";

export interface CheckCompanyInput {
  userId: string;
  companyId: string;
  /** The check moment - shared by all of the company's sources. */
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

  // During a general check the company is being checked anyway - we do not create
  // duplicates (src/server/checks/README.md). The button is disabled at that time,
  // and this protects against a request that arrived after the check started.
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

  // Sources are read at the same time: the HTTP client itself keeps politeness
  // towards sites (two requests per host, a pause between starts), not the order here.
  await Promise.all(
    sources.map((source) => checkSource(db, client, source, checkedAt)),
  );

  return { ok: true };
}
