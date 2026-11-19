import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { CareerPlatform } from "../../lib/companies/platform.ts";
import {
  careerSources,
  checkRuns,
  checkTasks,
  companies,
  users,
} from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { testDb } from "../db/testing/test-db.ts";
import { startCheckAll } from "./check-all.ts";

const now = new Date("2026-11-19T10:00:00Z");

interface SourceSeed {
  board: string;
  isTracked?: boolean;
  platform?: CareerPlatform;
}

/** Компанія користувача з джерелами - повертає id джерел. */
async function companyWith(
  userId: string,
  ...sources: SourceSeed[]
): Promise<string[]> {
  const [company] = await testDb
    .insert(companies)
    .values({ userId, name: sources[0].board, url: null, normalizedUrl: null })
    .returning();
  const rows = await testDb
    .insert(careerSources)
    .values(
      sources.map(({ board, isTracked = true, platform = "greenhouse" }) => ({
        companyId: company.id,
        url: `https://job-boards.greenhouse.io/${board}`,
        normalizedUrl: `job-boards.greenhouse.io/${board}`,
        platform,
        isTracked,
      })),
    )
    .returning();

  return rows.map((row) => row.id);
}

describe("startCheckAll", () => {
  it("creates a run with one background task per tracked source", async () => {
    // Одне джерело = одне завдання (docs/overview.md, розділ 3).
    const user = await seedSystemUser(testDb);
    const first = await companyWith(
      user.id,
      { board: "discord" },
      { board: "discord-eu" },
    );
    const second = await companyWith(user.id, { board: "linear" });

    const result = await startCheckAll(testDb, { userId: user.id, now });

    expect(result).toEqual({ ok: true, runId: expect.any(String), total: 3 });
    if (!result.ok) return;
    const [run] = await testDb.select().from(checkRuns);
    expect(run).toMatchObject({
      id: result.runId,
      userId: user.id,
      startedAt: now,
      finishedAt: null,
      sourcesTotal: 3,
    });
    const tasks = await testDb.select().from(checkTasks);
    expect(tasks.map((task) => task.sourceId).sort()).toEqual(
      [...first, ...second].sort(),
    );
    for (const task of tasks) {
      expect(task).toMatchObject({
        runId: result.runId,
        priority: "background",
        status: "queued",
        createdAt: now,
      });
    }
  });

  it("leaves out untracked sources and companies of other users", async () => {
    // Not tracked ніколи не бере участі в Check all (docs/ui.md, розділ 4.3).
    const user = await seedSystemUser(testDb);
    const [tracked] = await companyWith(
      user.id,
      { board: "discord" },
      { board: "acme", isTracked: false, platform: "unsupported" },
    );
    await companyWith(user.id, { board: "zeta", isTracked: false });
    const [other] = await testDb
      .insert(users)
      .values({ email: "other@job-digger.local" })
      .returning();
    await companyWith(other.id, { board: "linear" });

    const result = await startCheckAll(testDb, { userId: user.id, now });

    expect(result).toMatchObject({ ok: true, total: 1 });
    const tasks = await testDb.select().from(checkTasks);
    expect(tasks.map((task) => task.sourceId)).toEqual([tracked]);
  });

  it("refuses to start while the user's check is still running", async () => {
    const user = await seedSystemUser(testDb);
    await companyWith(user.id, { board: "discord" });
    await startCheckAll(testDb, { userId: user.id, now });

    expect(await startCheckAll(testDb, { userId: user.id, now })).toEqual({
      ok: false,
      reason: "already-running",
    });
    expect(await testDb.select().from(checkRuns)).toHaveLength(1);
    expect(await testDb.select().from(checkTasks)).toHaveLength(1);
  });

  it("starts only one check from two simultaneous clicks", async () => {
    const user = await seedSystemUser(testDb);
    await companyWith(user.id, { board: "discord" });

    const results = await Promise.all([
      startCheckAll(testDb, { userId: user.id, now }),
      startCheckAll(testDb, { userId: user.id, now }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await testDb.select().from(checkTasks)).toHaveLength(1);
  });

  it("starts nothing when there is nothing to check", async () => {
    // Порожній запуск дав би в History рядок без жодного джерела.
    const user = await seedSystemUser(testDb);
    await companyWith(user.id, { board: "acme", isTracked: false });

    expect(await startCheckAll(testDb, { userId: user.id, now })).toEqual({
      ok: false,
      reason: "nothing-to-check",
    });
    expect(await testDb.select().from(checkRuns)).toEqual([]);
  });

  it("starts again once the previous check has finished", async () => {
    const user = await seedSystemUser(testDb);
    await companyWith(user.id, { board: "discord" });
    const first = await startCheckAll(testDb, { userId: user.id, now });
    if (!first.ok) throw new Error("first check did not start");
    await testDb
      .update(checkRuns)
      .set({ finishedAt: now })
      .where(eq(checkRuns.id, first.runId));

    expect(await startCheckAll(testDb, { userId: user.id, now })).toMatchObject(
      { ok: true },
    );
  });
});
