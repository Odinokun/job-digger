import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { checkTasks } from "../db/schema.ts";
import { testDb } from "../db/testing/test-db.ts";
import { claimTask } from "./claim.ts";
import {
  companyToDiscover,
  greenhouseSource,
  minutesAfter,
  task,
} from "./test-fixtures.ts";

const now = new Date("2026-11-19T10:00:00Z");

async function statusOf(id: string) {
  const [row] = await testDb
    .select()
    .from(checkTasks)
    .where(eq(checkTasks.id, id));
  return row;
}

describe("claimTask", () => {
  it("returns null when the queue is empty", async () => {
    expect(await claimTask(testDb, { now, maxRunning: 5 })).toBeNull();
  });

  it("marks the claimed task running, locked now, one attempt spent", async () => {
    const sourceId = await greenhouseSource(testDb, "discord");
    const id = await task(testDb, { sourceId });

    const claimed = await claimTask(testDb, { now, maxRunning: 5 });

    expect(claimed).toEqual({
      id,
      kind: "check",
      sourceId,
      runId: null,
      attempts: 1,
      lockedAt: now,
      // The default task depth is a full read (task 6.16).
      readDepth: "full",
    });
    expect(await statusOf(id)).toMatchObject({
      status: "running",
      lockedAt: now,
      attempts: 1,
    });
  });

  it("takes manual tasks first, then the oldest", async () => {
    // A manual action waits for at most one background task, not the whole queue
    // (src/server/queue/README.md).
    const sourceId = await greenhouseSource(testDb, "discord");
    const old = minutesAfter(now, -10);
    const older = minutesAfter(now, -20);
    const newManual = await task(testDb, {
      sourceId,
      priority: "manual",
      createdAt: old,
    });
    const oldBackground = await task(testDb, {
      sourceId,
      priority: "background",
      createdAt: older,
    });
    const oldManual = await task(testDb, {
      sourceId,
      priority: "manual",
      createdAt: older,
    });

    const order = [];
    for (let i = 0; i < 3; i++) {
      order.push((await claimTask(testDb, { now, maxRunning: 5 }))?.id);
    }

    expect(order).toEqual([oldManual, newManual, oldBackground]);
  });

  it("skips tasks that are not queued", async () => {
    const sourceId = await greenhouseSource(testDb, "discord");
    await task(testDb, { sourceId, status: "running", lockedAt: now });
    await task(testDb, { sourceId, status: "succeeded" });
    await task(testDb, { sourceId, status: "failed" });

    expect(await claimTask(testDb, { now, maxRunning: 5 })).toBeNull();
  });

  it("claims nothing while the running limit is reached", async () => {
    const sourceId = await greenhouseSource(testDb, "discord");
    await task(testDb, { sourceId, status: "running", lockedAt: now });
    await task(testDb, { sourceId, status: "running", lockedAt: now });
    await task(testDb, { sourceId });

    expect(await claimTask(testDb, { now, maxRunning: 2 })).toBeNull();
  });

  it("never hands one task to two concurrent claims", async () => {
    const sourceId = await greenhouseSource(testDb, "discord");
    for (let i = 0; i < 3; i++) await task(testDb, { sourceId });

    const claims = await Promise.all(
      Array.from({ length: 6 }, () =>
        claimTask(testDb, { now, maxRunning: 10 }),
      ),
    );

    const ids = claims.flatMap((claim) => (claim ? [claim.id] : []));
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });

  it("keeps the running limit under concurrent claims", async () => {
    // The limit is shared by all processes: the "how many are already running"
    // check and the claim have to be one step, otherwise six simultaneous claims
    // see zero and each take a task.
    const sourceId = await greenhouseSource(testDb, "discord");
    for (let i = 0; i < 6; i++) await task(testDb, { sourceId });

    const claims = await Promise.all(
      Array.from({ length: 6 }, () =>
        claimTask(testDb, { now, maxRunning: 2 }),
      ),
    );

    expect(claims.filter((claim) => claim !== null)).toHaveLength(2);
  });

  it("hands out a discover task with its company", async () => {
    const companyId = await companyToDiscover(testDb, "Acme");
    const id = await task(testDb, { kind: "discover", companyId });

    const claimed = await claimTask(testDb, { now, maxRunning: 5 });

    expect(claimed).toEqual({
      id,
      kind: "discover",
      companyId,
      runId: null,
      attempts: 1,
      lockedAt: now,
    });
  });

  it("counts discover tasks against the shared limit", async () => {
    const companyId = await companyToDiscover(testDb, "Acme");
    const sourceId = await greenhouseSource(testDb, "discord");
    await task(testDb, { kind: "discover", companyId, status: "running" });
    await task(testDb, { sourceId });

    expect(await claimTask(testDb, { now, maxRunning: 1 })).toBeNull();
  });
});
