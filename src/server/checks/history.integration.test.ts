import { describe, expect, it } from "vitest";

import { checkRuns, users } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { testDb } from "../db/testing/test-db.ts";
import { listCheckRuns } from "./history.ts";

const start = new Date("2026-11-19T10:00:00Z");

function minutesAfter(from: Date, minutes: number): Date {
  return new Date(from.getTime() + minutes * 60_000);
}

/** `count` finished checks, each an hour later than the previous one. */
async function finishedRuns(userId: string, count: number) {
  return testDb
    .insert(checkRuns)
    .values(
      Array.from({ length: count }, (_, index) => ({
        userId,
        startedAt: minutesAfter(start, index * 60),
        finishedAt: minutesAfter(start, index * 60 + 2),
      })),
    )
    .returning();
}

describe("listCheckRuns", () => {
  it("shows the five numbers of a finished check", async () => {
    const user = await seedSystemUser(testDb);
    const [run] = await testDb
      .insert(checkRuns)
      .values({
        userId: user.id,
        startedAt: start,
        finishedAt: new Date(start.getTime() + 95_500),
        sourcesTotal: 4,
        sourcesChecked: 3,
        sourcesFailed: 1,
        newVacancies: 16,
        removedVacancies: 2,
      })
      .returning();

    expect(await listCheckRuns(testDb, { userId: user.id })).toEqual({
      items: [
        {
          id: run.id,
          startedAt: start,
          sourcesChecked: 3,
          newVacancies: 16,
          removedVacancies: 2,
          durationMs: 95_500,
        },
      ],
      nextCursor: null,
    });
  });

  it("leaves out the check that is still running", async () => {
    const user = await seedSystemUser(testDb);
    await testDb
      .insert(checkRuns)
      .values({ userId: user.id, startedAt: start });

    expect((await listCheckRuns(testDb, { userId: user.id })).items).toEqual(
      [],
    );
  });

  it("puts the newest check first", async () => {
    const user = await seedSystemUser(testDb);
    const runs = await finishedRuns(user.id, 3);

    const { items } = await listCheckRuns(testDb, { userId: user.id });

    expect(items.map((row) => row.id)).toEqual(
      runs.map((run) => run.id).reverse(),
    );
  });

  it("reads twenty at a time and continues after the cursor", async () => {
    // First 20 records, Load more adds the next 20.
    const user = await seedSystemUser(testDb);
    const runs = await finishedRuns(user.id, 25);
    const newestFirst = runs.map((run) => run.id).reverse();

    const first = await listCheckRuns(testDb, { userId: user.id });
    expect(first.items.map((row) => row.id)).toEqual(newestFirst.slice(0, 20));
    expect(first.nextCursor).not.toBeNull();

    const second = await listCheckRuns(testDb, {
      userId: user.id,
      after: first.nextCursor,
    });
    expect(second.items.map((row) => row.id)).toEqual(newestFirst.slice(20));
    expect(second.nextCursor).toBeNull();
  });

  it("does not lose a check that shares a start with the last one shown", async () => {
    const user = await seedSystemUser(testDb);
    const runs = await testDb
      .insert(checkRuns)
      .values(
        Array.from({ length: 3 }, () => ({
          userId: user.id,
          startedAt: start,
          finishedAt: minutesAfter(start, 1),
        })),
      )
      .returning();

    const first = await listCheckRuns(testDb, { userId: user.id, limit: 2 });
    const second = await listCheckRuns(testDb, {
      userId: user.id,
      limit: 2,
      after: first.nextCursor,
    });

    expect(
      [...first.items, ...second.items].map((row) => row.id).sort(),
    ).toEqual(runs.map((run) => run.id).sort());
  });

  it("starts from the beginning when the cursor is not usable", async () => {
    const user = await seedSystemUser(testDb);
    await finishedRuns(user.id, 2);

    const { items } = await listCheckRuns(testDb, {
      userId: user.id,
      after: { key: "yesterday", id: "not-a-uuid" },
    });

    expect(items).toHaveLength(2);
  });

  it("never shows another user's checks", async () => {
    const user = await seedSystemUser(testDb);
    const [other] = await testDb
      .insert(users)
      .values({ email: "other@job-digger.local" })
      .returning();
    await finishedRuns(other.id, 2);

    expect((await listCheckRuns(testDb, { userId: user.id })).items).toEqual(
      [],
    );
  });
});
