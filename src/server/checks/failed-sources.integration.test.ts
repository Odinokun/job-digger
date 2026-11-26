import { eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { careerSources, checkTasks, users } from "../db/schema.ts";
import { testDb } from "../db/testing/test-db.ts";
import {
  activeRun,
  greenhouseSource,
  minutesAfter,
  task,
} from "../queue/test-fixtures.ts";
import { listFailedSources, retryFailedSources } from "./failed-sources.ts";
import { seedSystemUser } from "../db/system-user.ts";

const start = new Date("2026-11-19T10:00:00Z");

/** A finished run of the system user. */
function finishedRun(startedAt = start) {
  return activeRun(testDb, {
    startedAt,
    finishedAt: minutesAfter(startedAt, 5),
  });
}

async function list() {
  const user = await seedSystemUser(testDb);
  return listFailedSources(testDb, { userId: user.id });
}

describe("listFailedSources", () => {
  it("lists the failed sources of the last finished run", async () => {
    const ok = await greenhouseSource(testDb, "discord");
    const broken = await greenhouseSource(testDb, "ghost");
    const runId = await finishedRun();
    await task(testDb, { sourceId: ok, runId, status: "succeeded" });
    await task(testDb, {
      sourceId: broken,
      runId,
      status: "failed",
      error: { reason: "bad-status", status: 503 },
    });

    expect(await list()).toEqual({
      canRetry: true,
      items: [
        {
          sourceId: broken,
          companyName: "ghost",
          url: "https://job-boards.greenhouse.io/ghost",
          label: null,
          reason: "bad-status",
          httpStatus: 503,
          isRetrying: false,
        },
      ],
    });
  });

  it("looks only at the latest finished run", async () => {
    const broken = await greenhouseSource(testDb, "ghost");
    const older = await finishedRun();
    await task(testDb, {
      sourceId: broken,
      runId: older,
      status: "failed",
      error: { reason: "not-found" },
    });
    const latest = await finishedRun(minutesAfter(start, 60));
    await task(testDb, {
      sourceId: broken,
      runId: latest,
      status: "succeeded",
    });

    expect((await list()).items).toEqual([]);
  });

  it("drops a source that a retry checked successfully", async () => {
    // A source checked successfully after Retry leaves the drawer.
    const broken = await greenhouseSource(testDb, "ghost");
    const runId = await finishedRun();
    await task(testDb, {
      sourceId: broken,
      runId,
      status: "failed",
      error: { reason: "not-found" },
      createdAt: start,
    });
    await task(testDb, {
      sourceId: broken,
      priority: "manual",
      status: "succeeded",
      createdAt: minutesAfter(start, 10),
    });

    expect((await list()).items).toEqual([]);
  });

  it("shows the result of the latest retry", async () => {
    const broken = await greenhouseSource(testDb, "ghost");
    const runId = await finishedRun();
    await task(testDb, {
      sourceId: broken,
      runId,
      status: "failed",
      error: { reason: "not-found" },
      createdAt: start,
    });
    await task(testDb, {
      sourceId: broken,
      priority: "manual",
      status: "failed",
      error: { reason: "fetch-failed", cause: "timeout" },
      createdAt: minutesAfter(start, 10),
    });

    expect((await list()).items).toMatchObject([
      { sourceId: broken, reason: "fetch-failed", isRetrying: false },
    ]);
  });

  it("marks a source whose retry is still in the queue", async () => {
    const broken = await greenhouseSource(testDb, "ghost");
    const runId = await finishedRun();
    await task(testDb, {
      sourceId: broken,
      runId,
      status: "failed",
      error: { reason: "not-found" },
      createdAt: start,
    });
    await task(testDb, {
      sourceId: broken,
      priority: "manual",
      createdAt: minutesAfter(start, 10),
    });

    expect((await list()).items).toMatchObject([
      { sourceId: broken, reason: "not-found", isRetrying: true },
    ]);
  });

  it("forgets a source deleted after the check", async () => {
    // A deleted source is not shown in the drawer (task 2.06).
    const broken = await greenhouseSource(testDb, "ghost");
    const runId = await finishedRun();
    await task(testDb, {
      sourceId: broken,
      runId,
      status: "failed",
      error: { reason: "not-found" },
    });
    await testDb.delete(careerSources).where(eq(careerSources.id, broken));

    expect((await list()).items).toEqual([]);
  });

  it("does not offer retry while a general check is running", async () => {
    // Retry is available only after the general check has finished.
    const broken = await greenhouseSource(testDb, "ghost");
    const runId = await finishedRun();
    await task(testDb, {
      sourceId: broken,
      runId,
      status: "failed",
      error: { reason: "not-found" },
    });
    await activeRun(testDb, { startedAt: minutesAfter(start, 60) });

    expect(await list()).toMatchObject({ canRetry: false, items: [{}] });
  });

  it("shows nothing of another user", async () => {
    const broken = await greenhouseSource(testDb, "ghost");
    const runId = await finishedRun();
    await task(testDb, {
      sourceId: broken,
      runId,
      status: "failed",
      error: { reason: "not-found" },
    });
    const [other] = await testDb
      .insert(users)
      .values({ email: "other@job-digger.local" })
      .returning();

    expect(await listFailedSources(testDb, { userId: other.id })).toEqual({
      canRetry: true,
      items: [],
    });
  });
});

/** The check finished, the sources from `boards` failed - returns their ids. */
async function failedCheck(...boards: string[]): Promise<string[]> {
  const ids = [];
  for (const board of boards) {
    ids.push(await greenhouseSource(testDb, board));
  }
  const runId = await finishedRun();
  for (const sourceId of ids) {
    await task(testDb, {
      sourceId,
      runId,
      status: "failed",
      error: { reason: "not-found" },
      createdAt: start,
    });
  }
  return ids;
}

async function retryTasks() {
  return testDb.select().from(checkTasks).where(isNull(checkTasks.runId));
}

const retryAt = minutesAfter(start, 30);

describe("retryFailedSources", () => {
  it("queues a manual task outside any run for the chosen source", async () => {
    // Retry does not change the History row and takes the queue ahead of background tasks.
    const [ghost] = await failedCheck("ghost", "phantom");
    const user = await seedSystemUser(testDb);

    const result = await retryFailedSources(testDb, {
      userId: user.id,
      sourceIds: [ghost],
      now: retryAt,
    });

    expect(result).toEqual({ ok: true, queued: 1 });
    expect(await retryTasks()).toMatchObject([
      {
        sourceId: ghost,
        priority: "manual",
        status: "queued",
        createdAt: retryAt,
      },
    ]);
    expect((await list()).items).toMatchObject([
      { sourceId: ghost, isRetrying: true },
      { isRetrying: false },
    ]);
  });

  it("reads as much as the check that failed", async () => {
    // Task 6.16: Retry after a manual Check all reads the first page, after a full
    // read - in full.
    const [quick, full] = await failedCheck("quick", "full");
    await testDb
      .update(checkTasks)
      .set({ readDepth: "first-page" })
      .where(eq(checkTasks.sourceId, quick));
    const user = await seedSystemUser(testDb);

    await retryFailedSources(testDb, {
      userId: user.id,
      sourceIds: "all",
      now: retryAt,
    });

    const depthOf = new Map(
      (await retryTasks()).map((row) => [row.sourceId, row.readDepth]),
    );
    expect(depthOf.get(quick)).toBe("first-page");
    expect(depthOf.get(full)).toBe("full");
  });

  it("retries every failed source with Retry all failed", async () => {
    const ids = await failedCheck("ghost", "phantom");
    const user = await seedSystemUser(testDb);

    expect(
      await retryFailedSources(testDb, {
        userId: user.id,
        sourceIds: "all",
        now: retryAt,
      }),
    ).toEqual({ ok: true, queued: 2 });
    expect((await retryTasks()).map((row) => row.sourceId).sort()).toEqual(
      [...ids].sort(),
    );
  });

  it("does not queue a second retry for a source already retrying", async () => {
    const [ghost] = await failedCheck("ghost");
    const user = await seedSystemUser(testDb);
    const retry = { userId: user.id, sourceIds: [ghost], now: retryAt };
    await retryFailedSources(testDb, retry);

    expect(await retryFailedSources(testDb, retry)).toEqual({
      ok: true,
      queued: 0,
    });
    expect(await retryTasks()).toHaveLength(1);
  });

  it("refuses sources that are not in the failed list", async () => {
    // The id comes from the client: another user's or a successful source cannot be checked this way.
    await failedCheck("ghost");
    const healthy = await greenhouseSource(testDb, "discord");
    const user = await seedSystemUser(testDb);

    expect(
      await retryFailedSources(testDb, {
        userId: user.id,
        sourceIds: [healthy],
        now: retryAt,
      }),
    ).toEqual({ ok: true, queued: 0 });
    expect(await retryTasks()).toEqual([]);
  });

  it("refuses to retry while a general check is running", async () => {
    const [ghost] = await failedCheck("ghost");
    await activeRun(testDb, { startedAt: minutesAfter(start, 60) });
    const user = await seedSystemUser(testDb);

    expect(
      await retryFailedSources(testDb, {
        userId: user.id,
        sourceIds: [ghost],
        now: retryAt,
      }),
    ).toEqual({ ok: false, reason: "check-running" });
    expect(await retryTasks()).toEqual([]);
  });
});
