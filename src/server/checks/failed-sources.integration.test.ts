import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { careerSources, users } from "../db/schema.ts";
import { testDb } from "../db/testing/test-db.ts";
import {
  activeRun,
  greenhouseSource,
  minutesAfter,
  task,
} from "../queue/test-fixtures.ts";
import { listFailedSources } from "./failed-sources.ts";
import { seedSystemUser } from "../db/system-user.ts";

const start = new Date("2026-11-19T10:00:00Z");

/** Завершений запуск системного користувача. */
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
    // Джерело, успішно перевірене після Retry, зникає з drawer.
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
    // Видалене джерело у drawer не показується (задача 2.06).
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
    // Retry доступний лише після завершення загальної перевірки.
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
