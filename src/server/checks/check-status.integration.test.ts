import { describe, expect, it } from "vitest";

import { checkRuns, users } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { testDb } from "../db/testing/test-db.ts";
import { getCheckStatus } from "./check-status.ts";

const now = new Date("2026-11-19T10:00:00Z");

describe("getCheckStatus", () => {
  it("reports no run and no unread for a fresh user", async () => {
    const user = await seedSystemUser(testDb);

    expect(await getCheckStatus(testDb, { userId: user.id })).toEqual({
      run: null,
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
