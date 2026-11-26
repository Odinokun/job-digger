import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { checkRuns, checkTasks } from "../db/schema.ts";
import { testDb } from "../db/testing/test-db.ts";
import { MAX_ATTEMPTS, recoverStaleTasks, STALE_AFTER_MS } from "./recover.ts";
import {
  activeRun,
  greenhouseSource,
  minutesAfter,
  task,
} from "./test-fixtures.ts";

const now = new Date("2026-11-19T10:00:00Z");
const staleLock = new Date(now.getTime() - STALE_AFTER_MS - 1);
const freshLock = new Date(now.getTime() - STALE_AFTER_MS + 60_000);

async function taskRow(id: string) {
  const [row] = await testDb
    .select()
    .from(checkTasks)
    .where(eq(checkTasks.id, id));
  return row;
}

async function runRow(id: string) {
  const [row] = await testDb
    .select()
    .from(checkRuns)
    .where(eq(checkRuns.id, id));
  return row;
}

describe("recoverStaleTasks", () => {
  it("returns a task stuck in running to the queue", async () => {
    // The process crashed in the middle of a check - the task must not hang forever.
    const sourceId = await greenhouseSource(testDb, "discord");
    const id = await task(testDb, {
      sourceId,
      status: "running",
      lockedAt: staleLock,
      attempts: 1,
    });

    expect(await recoverStaleTasks(testDb, { now })).toEqual({
      requeued: 1,
      failed: 0,
    });
    expect(await taskRow(id)).toMatchObject({
      status: "queued",
      lockedAt: null,
      attempts: 1,
    });
  });

  it("leaves a task that is still within its time", async () => {
    const sourceId = await greenhouseSource(testDb, "discord");
    const id = await task(testDb, {
      sourceId,
      status: "running",
      lockedAt: freshLock,
      attempts: 1,
    });

    expect(await recoverStaleTasks(testDb, { now })).toEqual({
      requeued: 0,
      failed: 0,
    });
    expect(await taskRow(id)).toMatchObject({
      status: "running",
      lockedAt: freshLock,
    });
  });

  it("fails a task that stalled on its last attempt and counts it", async () => {
    // A task that crashes the worker every time does not circle in the queue forever.
    const sourceId = await greenhouseSource(testDb, "discord");
    const runId = await activeRun(testDb, { sourcesTotal: 2 });
    const id = await task(testDb, {
      sourceId,
      runId,
      status: "running",
      lockedAt: staleLock,
      attempts: MAX_ATTEMPTS,
    });

    expect(await recoverStaleTasks(testDb, { now })).toEqual({
      requeued: 0,
      failed: 1,
    });
    expect(await taskRow(id)).toMatchObject({
      status: "failed",
      finishedAt: now,
      error: { reason: "stalled" },
    });
    expect(await runRow(runId)).toMatchObject({
      sourcesChecked: 1,
      sourcesFailed: 1,
    });
  });

  it("leaves the counters of a finished run alone", async () => {
    const sourceId = await greenhouseSource(testDb, "discord");
    const runId = await activeRun(testDb, {
      finishedAt: minutesAfter(now, -1),
    });
    await task(testDb, {
      sourceId,
      runId,
      status: "running",
      lockedAt: staleLock,
      attempts: MAX_ATTEMPTS,
    });

    await recoverStaleTasks(testDb, { now });

    expect(await runRow(runId)).toMatchObject({
      sourcesChecked: 0,
      sourcesFailed: 0,
    });
  });
});
