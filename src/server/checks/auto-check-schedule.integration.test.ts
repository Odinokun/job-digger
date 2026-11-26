import { describe, expect, it } from "vitest";

import { checkRuns, users } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { testDb } from "../db/testing/test-db.ts";
import { lastGeneralCheckStartedAt } from "./auto-check-schedule.ts";

describe("lastGeneralCheckStartedAt", () => {
  it("is null before the first general check", async () => {
    const user = await seedSystemUser(testDb);

    expect(await lastGeneralCheckStartedAt(testDb, user.id)).toBeNull();
  });

  it("is the latest start, whether that check finished or still runs", async () => {
    // A manual Check all restarts the count the same way as an automatic one, and
    // a check in progress counts too: otherwise the schedule would start another one.
    const user = await seedSystemUser(testDb);
    const latest = new Date("2026-11-20T09:00:00Z");
    await testDb.insert(checkRuns).values([
      {
        userId: user.id,
        startedAt: new Date("2026-11-19T09:00:00Z"),
        finishedAt: new Date("2026-11-19T09:05:00Z"),
      },
      { userId: user.id, startedAt: latest },
    ]);

    expect(await lastGeneralCheckStartedAt(testDb, user.id)).toEqual(latest);
  });

  it("ignores other users' checks", async () => {
    const owner = await seedSystemUser(testDb);
    const [other] = await testDb
      .insert(users)
      .values({ email: "other@job-digger.local" })
      .returning();
    await testDb.insert(checkRuns).values({
      userId: other.id,
      startedAt: new Date("2026-11-20T09:00:00Z"),
    });

    expect(await lastGeneralCheckStartedAt(testDb, owner.id)).toBeNull();
  });
});
