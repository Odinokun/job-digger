import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { careerSources, checkRuns, checkTasks } from "../db/schema.ts";
import { testDb } from "../db/testing/test-db.ts";
import { finalizeRuns, IDLE_RUN_MS } from "./finalize.ts";
import {
  activeRun,
  greenhouseSource,
  minutesAfter,
  task,
} from "./test-fixtures.ts";

const now = new Date("2026-11-19T10:00:00Z");
const longAgo = new Date(now.getTime() - IDLE_RUN_MS - 60_000);

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

describe("finalizeRuns", () => {
  it("closes a run with no unfinished tasks at its last finished task", async () => {
    const sourceId = await greenhouseSource(testDb, "discord");
    const runId = await activeRun(testDb, { startedAt: minutesAfter(now, -5) });
    const lastDone = minutesAfter(now, -1);
    await task(testDb, {
      sourceId,
      runId,
      status: "succeeded",
      finishedAt: minutesAfter(now, -3),
    });
    await task(testDb, {
      sourceId,
      runId,
      status: "failed",
      finishedAt: lastDone,
    });

    expect(await finalizeRuns(testDb, { now })).toEqual({
      completed: 1,
      abandoned: 0,
    });
    expect((await runRow(runId)).finishedAt).toEqual(lastDone);
  });

  it("keeps a run open while its tasks are moving", async () => {
    const sourceId = await greenhouseSource(testDb, "discord");
    const runId = await activeRun(testDb, { startedAt: longAgo });
    await task(testDb, {
      sourceId,
      runId,
      status: "succeeded",
      finishedAt: minutesAfter(now, -1),
    });
    await task(testDb, { sourceId, runId });

    expect(await finalizeRuns(testDb, { now })).toEqual({
      completed: 0,
      abandoned: 0,
    });
    expect((await runRow(runId)).finishedAt).toBeNull();
  });

  it("closes a run whose tasks went away with their sources", async () => {
    const sourceId = await greenhouseSource(testDb, "discord");
    const runId = await activeRun(testDb, { startedAt: minutesAfter(now, -1) });
    await task(testDb, { sourceId, runId });
    await testDb.delete(careerSources).where(eq(careerSources.id, sourceId));

    await finalizeRuns(testDb, { now });

    expect((await runRow(runId)).finishedAt).toEqual(now);
  });

  it("closes a run idle for too long with the numbers it has", async () => {
    // Перевірку перервав сон компʼютера чи вбитий сервер - без цього правила
    // запуск лишався б активним і блокував Check all назавжди
    // (docs/checks-and-queue.md, розділ 8).
    const sourceId = await greenhouseSource(testDb, "discord");
    const runId = await activeRun(testDb, {
      startedAt: minutesAfter(longAgo, -5),
      sourcesTotal: 3,
      sourcesChecked: 1,
    });
    await task(testDb, {
      sourceId,
      runId,
      status: "succeeded",
      finishedAt: longAgo,
    });
    const queued = await task(testDb, { sourceId, runId });
    const running = await task(testDb, {
      sourceId,
      runId,
      status: "running",
      lockedAt: minutesAfter(longAgo, -1),
    });

    expect(await finalizeRuns(testDb, { now })).toEqual({
      completed: 0,
      abandoned: 1,
    });
    expect(await runRow(runId)).toMatchObject({
      finishedAt: longAgo,
      sourcesChecked: 1,
      sourcesFailed: 0,
    });
    for (const id of [queued, running]) {
      expect(await taskRow(id)).toMatchObject({
        status: "failed",
        finishedAt: now,
        error: { reason: "abandoned" },
      });
    }
  });

  it("leaves finished runs and tasks outside runs alone", async () => {
    const sourceId = await greenhouseSource(testDb, "discord");
    const finishedAt = minutesAfter(longAgo, 1);
    const runId = await activeRun(testDb, { startedAt: longAgo, finishedAt });
    const checkNow = await task(testDb, {
      sourceId,
      createdAt: minutesAfter(longAgo, -1),
    });

    expect(await finalizeRuns(testDb, { now })).toEqual({
      completed: 0,
      abandoned: 0,
    });
    expect((await runRow(runId)).finishedAt).toEqual(finishedAt);
    expect(await taskRow(checkNow)).toMatchObject({ status: "queued" });
  });
});
