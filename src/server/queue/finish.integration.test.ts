import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { careerSources, checkRuns, checkTasks } from "../db/schema.ts";
import { testDb } from "../db/testing/test-db.ts";
import { claimTask } from "./claim.ts";
import { finishTask } from "./finish.ts";
import {
  activeRun,
  greenhouseSource,
  minutesAfter,
  task,
} from "./test-fixtures.ts";

const now = new Date("2026-11-19T10:00:00Z");
const later = minutesAfter(now, 1);

async function claimOne() {
  const claimed = await claimTask(testDb, { now, maxRunning: 5 });
  if (claimed === null) throw new Error("nothing to claim");
  return claimed;
}

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

describe("finishTask", () => {
  it("records a success and adds it to the run counters", async () => {
    const sourceId = await greenhouseSource(testDb, "discord");
    const runId = await activeRun(testDb, {
      sourcesTotal: 2,
      sourcesChecked: 1,
      newVacancies: 4,
    });
    await task(testDb, { sourceId, runId });
    const claimed = await claimOne();

    const accepted = await finishTask(testDb, claimed, {
      now: later,
      outcome: { ok: true, newVacancies: 3, removedVacancies: 2, skipped: 1 },
    });

    expect(accepted).toBe(true);
    expect(await taskRow(claimed.id)).toMatchObject({
      status: "succeeded",
      finishedAt: later,
      error: null,
      skippedVacancies: 1,
    });
    expect(await runRow(runId)).toMatchObject({
      sourcesChecked: 2,
      sourcesFailed: 0,
      newVacancies: 7,
      removedVacancies: 2,
    });
  });

  it("records a failure with its error and counts it as checked", async () => {
    // Sources checked у History включає невдалі.
    const sourceId = await greenhouseSource(testDb, "discord");
    const runId = await activeRun(testDb, { sourcesTotal: 1 });
    await task(testDb, { sourceId, runId });
    const claimed = await claimOne();

    await finishTask(testDb, claimed, {
      now: later,
      outcome: { ok: false, error: { reason: "not-found" } },
    });

    expect(await taskRow(claimed.id)).toMatchObject({
      status: "failed",
      finishedAt: later,
      error: { reason: "not-found" },
    });
    expect(await runRow(runId)).toMatchObject({
      sourcesChecked: 1,
      sourcesFailed: 1,
      newVacancies: 0,
    });
  });

  it("finishes a task outside any run without touching runs", async () => {
    // Check now і Retry не змінюють рядок History.
    const sourceId = await greenhouseSource(testDb, "discord");
    const runId = await activeRun(testDb);
    await task(testDb, { sourceId });
    const claimed = await claimOne();

    await finishTask(testDb, claimed, {
      now: later,
      outcome: { ok: true, newVacancies: 3, removedVacancies: 0, skipped: 0 },
    });

    expect(await taskRow(claimed.id)).toMatchObject({ status: "succeeded" });
    expect(await runRow(runId)).toMatchObject({
      sourcesChecked: 0,
      newVacancies: 0,
    });
  });

  it("leaves the counters of a finished run alone", async () => {
    // Рядок History фіксує результат на момент завершення.
    const sourceId = await greenhouseSource(testDb, "discord");
    const runId = await activeRun(testDb, { sourcesChecked: 5 });
    await task(testDb, { sourceId, runId });
    const claimed = await claimOne();
    await testDb
      .update(checkRuns)
      .set({ finishedAt: now })
      .where(eq(checkRuns.id, runId));

    await finishTask(testDb, claimed, {
      now: later,
      outcome: { ok: false, error: { reason: "unreadable" } },
    });

    expect(await taskRow(claimed.id)).toMatchObject({ status: "failed" });
    expect(await runRow(runId)).toMatchObject({
      sourcesChecked: 5,
      sourcesFailed: 0,
    });
  });

  it("rejects a late result once the task was claimed again", async () => {
    // Обробник завис, завдання повернулось у чергу й дісталося іншому -
    // результат першого більше не належить завданню.
    const sourceId = await greenhouseSource(testDb, "discord");
    const runId = await activeRun(testDb);
    await task(testDb, { sourceId, runId });
    const stale = await claimOne();
    await testDb
      .update(checkTasks)
      .set({ lockedAt: later })
      .where(eq(checkTasks.id, stale.id));

    const accepted = await finishTask(testDb, stale, {
      now: later,
      outcome: { ok: true, newVacancies: 3, removedVacancies: 0, skipped: 0 },
    });

    expect(accepted).toBe(false);
    expect(await taskRow(stale.id)).toMatchObject({
      status: "running",
      finishedAt: null,
    });
    expect(await runRow(runId)).toMatchObject({ sourcesChecked: 0 });
  });

  it("rejects the result when the source was deleted meanwhile", async () => {
    const sourceId = await greenhouseSource(testDb, "discord");
    const runId = await activeRun(testDb, { sourcesChecked: 1 });
    await task(testDb, { sourceId, runId });
    const claimed = await claimOne();
    await testDb.delete(careerSources).where(eq(careerSources.id, sourceId));

    const accepted = await finishTask(testDb, claimed, {
      now: later,
      outcome: { ok: true, newVacancies: 3, removedVacancies: 0, skipped: 0 },
    });

    expect(accepted).toBe(false);
    expect(await runRow(runId)).toMatchObject({ sourcesChecked: 1 });
  });
});
