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
import { finalizeRuns, IDLE_RUN_MS } from "../queue/finalize.ts";
import { startCheckAll } from "./check-all.ts";
import { companySiteValues } from "../db/testing/company-values.ts";

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
    .values({
      userId,
      name: sources[0].board,
      ...companySiteValues(sources[0].board),
    })
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
    // Одне джерело = одне завдання (CLAUDE.md, «Архітектура»).
    const user = await seedSystemUser(testDb);
    const first = await companyWith(
      user.id,
      { board: "discord" },
      { board: "discord-eu" },
    );
    const second = await companyWith(user.id, { board: "linear" });

    const result = await startCheckAll(testDb, {
      userId: user.id,
      depthMode: "first-page",
      now,
    });

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

  it("asks every source for its first page in a manual Check all", async () => {
    const user = await seedSystemUser(testDb);
    await companyWith(user.id, { board: "discord" }, { board: "linear" });

    await startCheckAll(testDb, {
      userId: user.id,
      depthMode: "first-page",
      now,
    });

    const tasks = await testDb.select().from(checkTasks);
    expect(tasks.map((task) => task.readDepth)).toEqual([
      "first-page",
      "first-page",
    ]);
  });

  it("reads in full in an auto check only the sources not read in full for a day", async () => {
    // Задача 6.16: повне читання в автоперевірці - раз на добу на джерело.
    const user = await seedSystemUser(testDb);
    const [fresh, stale, never] = await companyWith(
      user.id,
      { board: "fresh" },
      { board: "stale" },
      { board: "never" },
    );
    const hour = 60 * 60 * 1000;
    await testDb
      .update(careerSources)
      .set({ lastFullReadAt: new Date(now.getTime() - 2 * hour) })
      .where(eq(careerSources.id, fresh));
    await testDb
      .update(careerSources)
      .set({ lastFullReadAt: new Date(now.getTime() - 25 * hour) })
      .where(eq(careerSources.id, stale));

    await startCheckAll(testDb, { userId: user.id, depthMode: "auto", now });

    const depthOf = new Map(
      (await testDb.select().from(checkTasks)).map((task) => [
        task.sourceId,
        task.readDepth,
      ]),
    );
    expect(depthOf.get(fresh)).toBe("first-page");
    expect(depthOf.get(stale)).toBe("full");
    expect(depthOf.get(never)).toBe("full");
  });

  it("leaves out untracked sources and companies of other users", async () => {
    // Not tracked ніколи не бере участі в Check all.
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

    const result = await startCheckAll(testDb, {
      userId: user.id,
      depthMode: "first-page",
      now,
    });

    expect(result).toMatchObject({ ok: true, total: 1 });
    const tasks = await testDb.select().from(checkTasks);
    expect(tasks.map((task) => task.sourceId)).toEqual([tracked]);
  });

  it("refuses to start while the user's check is still running", async () => {
    const user = await seedSystemUser(testDb);
    await companyWith(user.id, { board: "discord" });
    await startCheckAll(testDb, {
      userId: user.id,
      depthMode: "first-page",
      now,
    });

    expect(
      await startCheckAll(testDb, {
        userId: user.id,
        depthMode: "first-page",
        now,
      }),
    ).toEqual({
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
      startCheckAll(testDb, { userId: user.id, depthMode: "first-page", now }),
      startCheckAll(testDb, { userId: user.id, depthMode: "first-page", now }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await testDb.select().from(checkTasks)).toHaveLength(1);
  });

  it("starts nothing when there is nothing to check", async () => {
    // Порожній запуск дав би в History рядок без жодного джерела.
    const user = await seedSystemUser(testDb);
    await companyWith(user.id, { board: "acme", isTracked: false });

    expect(
      await startCheckAll(testDb, {
        userId: user.id,
        depthMode: "first-page",
        now,
      }),
    ).toEqual({
      ok: false,
      reason: "nothing-to-check",
    });
    expect(await testDb.select().from(checkRuns)).toEqual([]);
  });

  it("starts again once the previous check has finished", async () => {
    const user = await seedSystemUser(testDb);
    await companyWith(user.id, { board: "discord" });
    const first = await startCheckAll(testDb, {
      userId: user.id,
      depthMode: "first-page",
      now,
    });
    if (!first.ok) throw new Error("first check did not start");
    await testDb
      .update(checkRuns)
      .set({ finishedAt: now })
      .where(eq(checkRuns.id, first.runId));

    expect(
      await startCheckAll(testDb, {
        userId: user.id,
        depthMode: "first-page",
        now,
      }),
    ).toMatchObject({ ok: true });
  });

  it("is not blocked forever by a run that stopped moving", async () => {
    // Перевірку перервали сон компʼютера чи вбитий сервер: без закриття
    // завислого запуску Check all і автоперевірки були б заблоковані назавжди
    // (src/server/checks/README.md).
    const user = await seedSystemUser(testDb);
    await companyWith(user.id, { board: "discord" });
    await startCheckAll(testDb, {
      userId: user.id,
      depthMode: "first-page",
      now,
    });
    const later = new Date(now.getTime() + IDLE_RUN_MS + 60_000);

    expect(
      await startCheckAll(testDb, {
        userId: user.id,
        depthMode: "first-page",
        now: later,
      }),
    ).toEqual({ ok: false, reason: "already-running" });

    await finalizeRuns(testDb, { now: later });

    expect(
      await startCheckAll(testDb, {
        userId: user.id,
        depthMode: "first-page",
        now: later,
      }),
    ).toMatchObject({ ok: true });
  });
});
