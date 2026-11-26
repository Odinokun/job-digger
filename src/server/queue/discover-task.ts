/**
 * Running the Find new pages task for one Not tracked company (task 5.10). The
 * rules are in the README.md next to this file, "Page search".
 */
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { CareerPlatform } from "../../lib/companies/platform.ts";
import { normalizeCompanyUrl } from "../../lib/companies/url.ts";
import type { PagePlatforms } from "../companies/page-platform.ts";
import { findCompaniesWithSources } from "../companies/source-duplicates.ts";
import { addCareerSources } from "../companies/sources.ts";
import { careerSources, checkTasks, companies } from "../db/schema.ts";
import { discoverCompany, type Finding } from "../discovery/discover.ts";
import { decideNewPages } from "../discovery/new-pages.ts";
import type { HttpClient } from "../http/client.ts";
import type { ClaimedTask } from "./claim.ts";
import { finishTask, type TaskOutcome } from "./finish.ts";

export interface RunDiscoverTaskOptions {
  /** The clock for `finished_at`. Tests pass a fixed moment. */
  clock?: () => Date;
}

/** A successful search: it counts no vacancies and has no run counters. */
const DONE: TaskOutcome = {
  ok: true,
  newVacancies: 0,
  removedVacancies: 0,
  skipped: 0,
};

/**
 * Searches for the company's pages, adds the reliable findings as sources,
 * queues their first check and records the status of the Not tracked tab.
 *
 * Returns `false` if the result is discarded: the company was deleted, or the
 * task already belongs to another worker (`finishTask`).
 */
export async function runDiscoverTask(
  db: NodePgDatabase,
  client: HttpClient,
  claimed: Extract<ClaimedTask, { kind: "discover" }>,
  { clock = () => new Date() }: RunDiscoverTaskOptions = {},
): Promise<boolean> {
  const [company] = await db
    .select({
      id: companies.id,
      userId: companies.userId,
      name: companies.name,
      url: companies.url,
    })
    .from(companies)
    .where(eq(companies.id, claimed.companyId));

  // The company was deleted after the claim - the task went with it.
  if (company === undefined) return false;

  let outcome: TaskOutcome = DONE;
  try {
    const { findings, siteFailed } = await discoverCompany(
      { siteUrl: company.url, name: company.name },
      client,
    );
    const owners = await findCompaniesWithSources(db, {
      userId: company.userId,
      urls: findings.map((finding) => finding.url),
    });
    const taken = new Set<string>();
    const owned = new Set<string>();
    for (const [url, owner] of owners) {
      (owner.id === company.id ? owned : taken).add(url);
    }
    const decision = decideNewPages({ findings, siteFailed, taken, owned });

    await db.transaction(async (tx) => {
      if (decision.add.length > 0) {
        const added = await addCareerSources(tx, {
          userId: company.userId,
          companyId: company.id,
          sources: decision.add.map((url) => ({ url })),
          // The search already knows the finding's platform, including one
          // recognised by the page content (PeopleForce on the company's domain,
          // task 5.13): the address will not name it, and there is no point in
          // loading the page a second time.
          pagePlatforms: platformsOf(findings),
        });
        // Between the search and the insert another company may have taken the
        // page: an error in the transaction rolls everything back, and the task fails.
        if (!added.ok) {
          throw new Error(`Found pages were refused: ${added.problem}`);
        }

        // The first check of the added boards, as after Save (5.09), but in the
        // background and outside History: it is neither a manual action nor a
        // general check.
        const tracked = await tx
          .select({ id: careerSources.id })
          .from(careerSources)
          .where(
            and(
              eq(careerSources.companyId, company.id),
              eq(careerSources.isTracked, true),
            ),
          );
        if (tracked.length > 0) {
          await tx.insert(checkTasks).values(
            tracked.map((source) => ({
              kind: "check" as const,
              sourceId: source.id,
              priority: "background" as const,
            })),
          );
        }
      }

      if (decision.status !== null) {
        await tx
          .update(companies)
          .set({ discoveryStatus: decision.status })
          .where(eq(companies.id, company.id));
      }
    });
  } catch (error) {
    // The search returns site failures as values, so what reaches here is a bug
    // in our code or a refused insert. The status tells the user it is worth
    // trying again.
    console.error(`Discover task ${claimed.id} crashed`, error);
    await db
      .update(companies)
      .set({ discoveryStatus: "check_failed" })
      .where(eq(companies.id, company.id));
    outcome = { ok: false, error: { reason: "crashed" } };
  }

  return finishTask(db, claimed, { now: clock(), outcome });
}

/** Finding platforms by cleaned address - the way `addCareerSources` expects them. */
function platformsOf(findings: Finding[]): PagePlatforms {
  const platforms = new Map<string, CareerPlatform>();

  for (const finding of findings) {
    const normalized = normalizeCompanyUrl(finding.url);

    if (normalized.ok) {
      platforms.set(normalized.url, finding.platform);
    }
  }

  return platforms;
}
