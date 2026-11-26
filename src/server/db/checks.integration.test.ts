import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { careerSources, checkRuns, checkTasks, companies } from "./schema.ts";
import { seedSystemUser } from "./system-user.ts";
import { testDb } from "./testing/test-db.ts";
import { companySiteValues } from "./testing/company-values.ts";

// Drizzle wraps the driver error in DrizzleQueryError, the code is in `cause`.
const UNIQUE_VIOLATION = { cause: { code: "23505" } };

describe("check_runs", () => {
  it("starts active with zero counters and an unshown summary", async () => {
    const user = await seedSystemUser(testDb);

    const [run] = await testDb
      .insert(checkRuns)
      .values({ userId: user.id })
      .returning();

    expect(run).toMatchObject({
      finishedAt: null,
      summaryShownAt: null,
      sourcesTotal: 0,
      sourcesChecked: 0,
      sourcesFailed: 0,
      newVacancies: 0,
      removedVacancies: 0,
    });
    expect(run.startedAt).toBeInstanceOf(Date);
  });

  it("refuses a second active run for the same user", async () => {
    // One general check at a time per user (src/server/checks/README.md) - the
    // database enforces it, so two simultaneous Check all cannot slip through.
    const user = await seedSystemUser(testDb);
    await testDb.insert(checkRuns).values({ userId: user.id });

    await expect(
      testDb.insert(checkRuns).values({ userId: user.id }),
    ).rejects.toMatchObject(UNIQUE_VIOLATION);
  });

  it("allows a new run once the previous one has finished", async () => {
    const user = await seedSystemUser(testDb);
    const [first] = await testDb
      .insert(checkRuns)
      .values({ userId: user.id })
      .returning();
    await testDb
      .update(checkRuns)
      .set({ finishedAt: new Date() })
      .where(eq(checkRuns.id, first.id));

    await testDb.insert(checkRuns).values({ userId: user.id });

    expect(await testDb.select().from(checkRuns)).toHaveLength(2);
  });
});

/** A company with one Greenhouse source - returns the source id. */
async function greenhouseSource(board: string): Promise<string> {
  const user = await seedSystemUser(testDb);
  const [company] = await testDb
    .insert(companies)
    .values({ userId: user.id, name: board, ...companySiteValues(board) })
    .returning();
  const [source] = await testDb
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

describe("check_tasks", () => {
  it("starts queued as a background task outside any run", async () => {
    const sourceId = await greenhouseSource("discord");

    const [task] = await testDb
      .insert(checkTasks)
      .values({ sourceId })
      .returning();

    expect(task).toMatchObject({
      runId: null,
      status: "queued",
      priority: "background",
      attempts: 0,
      lockedAt: null,
      finishedAt: null,
      error: null,
      skippedVacancies: 0,
    });
    expect(task.createdAt).toBeInstanceOf(Date);
  });

  it("belongs to a run when the run created it", async () => {
    const sourceId = await greenhouseSource("discord");
    const user = await seedSystemUser(testDb);
    const [run] = await testDb
      .insert(checkRuns)
      .values({ userId: user.id })
      .returning();

    const [task] = await testDb
      .insert(checkTasks)
      .values({ sourceId, runId: run.id })
      .returning();

    expect(task.runId).toBe(run.id);
  });

  it("keeps the parser error as structured data", async () => {
    const sourceId = await greenhouseSource("discord");

    const [task] = await testDb
      .insert(checkTasks)
      .values({
        sourceId,
        status: "failed",
        error: { reason: "bad-status", status: 503 },
      })
      .returning();

    expect(task.error).toEqual({ reason: "bad-status", status: 503 });
  });

  it("sorts manual tasks before background ones", async () => {
    // Manual actions are taken from the queue before background ones
    // (src/server/queue/README.md): claiming sorts by `priority`, and the enum sets the order.
    const sourceId = await greenhouseSource("discord");
    await testDb.insert(checkTasks).values([
      { sourceId, priority: "background" },
      { sourceId, priority: "manual" },
    ]);

    const rows = await testDb
      .select({ priority: checkTasks.priority })
      .from(checkTasks)
      .orderBy(asc(checkTasks.priority));

    expect(rows.map((row) => row.priority)).toEqual(["manual", "background"]);
  });

  it("disappears with its source and leaves the run counters alone", async () => {
    // A deleted source does not get into the Failed Sources Drawer, and the run's
    // numbers stay as they were (src/server/checks/README.md).
    const sourceId = await greenhouseSource("discord");
    const user = await seedSystemUser(testDb);
    const [run] = await testDb
      .insert(checkRuns)
      .values({ userId: user.id, sourcesTotal: 1, sourcesChecked: 1 })
      .returning();
    await testDb.insert(checkTasks).values({ sourceId, runId: run.id });

    await testDb.delete(careerSources).where(eq(careerSources.id, sourceId));

    expect(await testDb.select().from(checkTasks)).toEqual([]);
    const [after] = await testDb.select().from(checkRuns);
    expect(after).toMatchObject({ sourcesTotal: 1, sourcesChecked: 1 });
  });
});
