import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { checkRuns, users } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { testDb } from "../db/testing/test-db.ts";
import { getCheckStatus, markSummaryShown } from "./check-status.ts";

const now = new Date("2026-11-19T10:00:00Z");

describe("getCheckStatus", () => {
  it("reports no run and no unread for a fresh user", async () => {
    const user = await seedSystemUser(testDb);

    expect(await getCheckStatus(testDb, { userId: user.id })).toEqual({
      run: null,
      summary: null,
      unread: 0,
    });
  });

  it("reports the progress of the active run", async () => {
    const user = await seedSystemUser(testDb);
    await testDb.insert(checkRuns).values({
      userId: user.id,
      startedAt: now,
      sourcesTotal: 120,
      sourcesChecked: 37,
      sourcesFailed: 2,
      newVacancies: 15,
      removedVacancies: 4,
    });

    expect(await getCheckStatus(testDb, { userId: user.id })).toMatchObject({
      run: {
        total: 120,
        checked: 37,
        failed: 2,
        newVacancies: 15,
        removedVacancies: 4,
      },
    });
  });

  it("ignores finished runs and runs of other users", async () => {
    const user = await seedSystemUser(testDb);
    const [other] = await testDb
      .insert(users)
      .values({ email: "other@job-digger.local" })
      .returning();
    await testDb.insert(checkRuns).values([
      { userId: user.id, startedAt: now, finishedAt: now },
      { userId: other.id, startedAt: now },
    ]);

    expect(await getCheckStatus(testDb, { userId: user.id })).toMatchObject({
      run: null,
    });
  });
});

function minutesAfter(from: Date, minutes: number): Date {
  return new Date(from.getTime() + minutes * 60_000);
}

describe("check summary", () => {
  it("offers the summary of a finished run that was not shown yet", async () => {
    // Перевірка часто завершується при закритій вкладці - підсумок має
    // дочекатися наступного відкриття (docs/checks-and-queue.md, розділ 8).
    const user = await seedSystemUser(testDb);
    const [run] = await testDb
      .insert(checkRuns)
      .values({
        userId: user.id,
        startedAt: now,
        finishedAt: minutesAfter(now, 2),
        sourcesTotal: 3,
        sourcesChecked: 3,
        sourcesFailed: 1,
        newVacancies: 16,
        removedVacancies: 2,
      })
      .returning();

    expect(await getCheckStatus(testDb, { userId: user.id })).toMatchObject({
      run: null,
      summary: {
        runId: run.id,
        checked: 3,
        failed: 1,
        newVacancies: 16,
        removedVacancies: 2,
      },
    });
  });

  it("offers only the latest of several unshown summaries", async () => {
    const user = await seedSystemUser(testDb);
    const runs = await testDb
      .insert(checkRuns)
      .values([
        { userId: user.id, startedAt: now, finishedAt: minutesAfter(now, 1) },
        {
          userId: user.id,
          startedAt: minutesAfter(now, 60),
          finishedAt: minutesAfter(now, 61),
        },
      ])
      .returning();

    const status = await getCheckStatus(testDb, { userId: user.id });

    expect(status.summary?.runId).toBe(runs[1].id);
  });

  it("does not offer a summary that was already shown", async () => {
    const user = await seedSystemUser(testDb);
    await testDb.insert(checkRuns).values({
      userId: user.id,
      startedAt: now,
      finishedAt: minutesAfter(now, 1),
      summaryShownAt: minutesAfter(now, 2),
    });

    expect(await getCheckStatus(testDb, { userId: user.id })).toMatchObject({
      summary: null,
    });
  });

  it("marks the shown summary and every older one as shown", async () => {
    // Інакше після кількох автоперевірок за відсутності підсумки спливали б
    // один за одним.
    const user = await seedSystemUser(testDb);
    const [older, latest] = await testDb
      .insert(checkRuns)
      .values([
        { userId: user.id, startedAt: now, finishedAt: minutesAfter(now, 1) },
        {
          userId: user.id,
          startedAt: minutesAfter(now, 60),
          finishedAt: minutesAfter(now, 61),
        },
      ])
      .returning();
    const shownAt = minutesAfter(now, 90);

    await markSummaryShown(testDb, {
      userId: user.id,
      runId: latest.id,
      now: shownAt,
    });

    const rows = await testDb.select().from(checkRuns);
    expect(rows.map((row) => row.summaryShownAt)).toEqual([shownAt, shownAt]);
    expect(older.summaryShownAt).toBeNull();
    expect(await getCheckStatus(testDb, { userId: user.id })).toMatchObject({
      summary: null,
    });
  });

  it("leaves newer summaries and other users alone", async () => {
    const user = await seedSystemUser(testDb);
    const [other] = await testDb
      .insert(users)
      .values({ email: "other@job-digger.local" })
      .returning();
    const [shown, newer, foreign] = await testDb
      .insert(checkRuns)
      .values([
        { userId: user.id, startedAt: now, finishedAt: minutesAfter(now, 1) },
        {
          userId: user.id,
          startedAt: minutesAfter(now, 60),
          finishedAt: minutesAfter(now, 61),
        },
        { userId: other.id, startedAt: now, finishedAt: minutesAfter(now, 1) },
      ])
      .returning();

    await markSummaryShown(testDb, {
      userId: user.id,
      runId: shown.id,
      now: minutesAfter(now, 90),
    });

    for (const id of [newer.id, foreign.id]) {
      const [row] = await testDb
        .select()
        .from(checkRuns)
        .where(eq(checkRuns.id, id));
      expect(row.summaryShownAt).toBeNull();
    }
  });

  it("ignores a run of another user", async () => {
    const user = await seedSystemUser(testDb);
    const [other] = await testDb
      .insert(users)
      .values({ email: "other@job-digger.local" })
      .returning();
    const [foreign] = await testDb
      .insert(checkRuns)
      .values({ userId: other.id, startedAt: now, finishedAt: now })
      .returning();

    await markSummaryShown(testDb, {
      userId: user.id,
      runId: foreign.id,
      now,
    });

    const [row] = await testDb.select().from(checkRuns);
    expect(row.summaryShownAt).toBeNull();
  });
});
