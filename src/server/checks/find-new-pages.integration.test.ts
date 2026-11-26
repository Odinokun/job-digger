import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { checkTasks, users } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { testDb } from "../db/testing/test-db.ts";
import {
  activeRun,
  companyToDiscover,
  greenhouseSource,
  task,
} from "../queue/test-fixtures.ts";
import { isFindingNewPages, startFindNewPages } from "./find-new-pages.ts";

const now = new Date("2026-11-19T10:00:00Z");

async function discoverTasks() {
  return testDb
    .select()
    .from(checkTasks)
    .where(eq(checkTasks.kind, "discover"));
}

describe("startFindNewPages", () => {
  it("queues one background search per Not tracked company", async () => {
    const user = await seedSystemUser(testDb);
    const acme = await companyToDiscover(testDb, "Acme");
    const initech = await companyToDiscover(testDb, "Initech");
    // A company with a tracked source - on the Tracked tab.
    await greenhouseSource(testDb, "discord");

    const result = await startFindNewPages(testDb, { userId: user.id, now });

    expect(result).toEqual({ ok: true, total: 2 });
    const tasks = await discoverTasks();
    expect(tasks.map((row) => row.companyId).sort()).toEqual(
      [acme, initech].sort(),
    );
    expect(tasks[0]).toMatchObject({
      priority: "background",
      status: "queued",
      runId: null,
    });
  });

  it("refuses while the previous search is still going", async () => {
    const user = await seedSystemUser(testDb);
    const acme = await companyToDiscover(testDb, "Acme");
    await task(testDb, {
      kind: "discover",
      companyId: acme,
      status: "running",
    });

    expect(await startFindNewPages(testDb, { userId: user.id, now })).toEqual({
      ok: false,
      reason: "already-running",
    });
  });

  it("starts again once the previous search finished", async () => {
    const user = await seedSystemUser(testDb);
    const acme = await companyToDiscover(testDb, "Acme");
    await task(testDb, {
      kind: "discover",
      companyId: acme,
      status: "succeeded",
    });

    expect(await startFindNewPages(testDb, { userId: user.id, now })).toEqual({
      ok: true,
      total: 1,
    });
  });

  it("has nothing to search when every company is tracked", async () => {
    const user = await seedSystemUser(testDb);
    await greenhouseSource(testDb, "discord");

    expect(await startFindNewPages(testDb, { userId: user.id, now })).toEqual({
      ok: false,
      reason: "nothing-to-search",
    });
  });

  it("starts only once for simultaneous clicks", async () => {
    // Without the advisory lock every click sees no search yet and queues its own.
    const user = await seedSystemUser(testDb);
    await companyToDiscover(testDb, "Acme");
    // Warm up the pool: otherwise the first click goes through an already open
    // connection and finishes while the rest are still connecting - and there is no race.
    await Promise.all(
      Array.from({ length: 6 }, () =>
        testDb.execute(sql`select pg_sleep(0.05)`),
      ),
    );

    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        startFindNewPages(testDb, { userId: user.id, now }),
      ),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await discoverTasks()).toHaveLength(1);
  });
});

describe("isFindingNewPages", () => {
  it("is true while a search of the user is queued or running", async () => {
    const user = await seedSystemUser(testDb);
    const acme = await companyToDiscover(testDb, "Acme");

    expect(await isFindingNewPages(testDb, user.id)).toBe(false);
    await task(testDb, { kind: "discover", companyId: acme });
    expect(await isFindingNewPages(testDb, user.id)).toBe(true);
  });

  it("stays true while the first checks of added boards are queued", async () => {
    // The search queues them (`queue/discover-task.ts`): in the background and without a run.
    const user = await seedSystemUser(testDb);
    const sourceId = await greenhouseSource(testDb, "discord");
    await task(testDb, { sourceId, priority: "background" });

    expect(await isFindingNewPages(testDb, user.id)).toBe(true);
  });

  it("does not count Retry or Check all as a search", async () => {
    const user = await seedSystemUser(testDb);
    const sourceId = await greenhouseSource(testDb, "discord");
    await task(testDb, { sourceId, priority: "manual" });
    const runId = await activeRun(testDb);
    await task(testDb, { sourceId, runId, priority: "background" });

    expect(await isFindingNewPages(testDb, user.id)).toBe(false);
  });

  it("does not see a search of another user", async () => {
    const owner = await seedSystemUser(testDb);
    const acme = await companyToDiscover(testDb, "Acme");
    await task(testDb, { kind: "discover", companyId: acme });
    const [stranger] = await testDb
      .insert(users)
      .values({ email: "stranger@job-digger.local" })
      .returning();

    expect(await isFindingNewPages(testDb, owner.id)).toBe(true);
    expect(await isFindingNewPages(testDb, stranger.id)).toBe(false);
  });
});
