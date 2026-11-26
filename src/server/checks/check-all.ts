/**
 * Check all: a general check of every company on the Tracked tab
 * (src/server/checks/README.md). Only the queuing is here - the queue loop checks
 * the sources themselves (`queue/worker.ts`).
 */
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  careerSources,
  checkRuns,
  checkTasks,
  companies,
} from "../db/schema.ts";
import { type CheckAllDepthMode, taskReadDepth } from "./read-depth.ts";

export interface StartCheckAllInput {
  userId: string;
  /**
   * How much to read from each source (task 6.16): a manual Check all reads only
   * the first page, an auto-check uses `auto` (`read-depth.ts`).
   */
  depthMode: CheckAllDepthMode;
  /** The start time - Date & time in History. */
  now: Date;
}

export type StartCheckAllResult =
  | { ok: true; runId: string; total: number }
  | { ok: false; reason: "already-running" | "nothing-to-check" };

export async function startCheckAll(
  db: NodePgDatabase,
  { userId, depthMode, now }: StartCheckAllInput,
): Promise<StartCheckAllResult> {
  return db.transaction(async (tx) => {
    // The Tracked tab holds companies with at least one tracked source, so taking
    // just those sources is enough.
    const sources = await tx
      .select({
        id: careerSources.id,
        lastFullReadAt: careerSources.lastFullReadAt,
      })
      .from(careerSources)
      .innerJoin(companies, eq(companies.id, careerSources.companyId))
      .where(
        and(eq(companies.userId, userId), eq(careerSources.isTracked, true)),
      );

    if (sources.length === 0) {
      return { ok: false, reason: "nothing-to-check" };
    }

    // A partial unique index holds one active check per user. `do nothing` instead
    // of an exception: a second simultaneous click waits for the first transaction
    // and simply inserts nothing.
    const [run] = await tx
      .insert(checkRuns)
      .values({ userId, startedAt: now, sourcesTotal: sources.length })
      .onConflictDoNothing()
      .returning({ id: checkRuns.id });

    if (run === undefined) {
      return { ok: false, reason: "already-running" };
    }

    await tx.insert(checkTasks).values(
      sources.map((source) => ({
        sourceId: source.id,
        runId: run.id,
        priority: "background" as const,
        readDepth: taskReadDepth({
          mode: depthMode,
          lastFullReadAt: source.lastFullReadAt,
          now,
        }),
        createdAt: now,
      })),
    );

    return { ok: true, runId: run.id, total: sources.length };
  });
}
