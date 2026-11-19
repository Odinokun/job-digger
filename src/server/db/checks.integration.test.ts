import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { checkRuns } from "./schema.ts";
import { seedSystemUser } from "./system-user.ts";
import { testDb } from "./testing/test-db.ts";

// Drizzle обертає помилку драйвера у DrizzleQueryError, код - у `cause`.
const UNIQUE_VIOLATION = { cause: { code: "23505" } };

describe("check_runs", () => {
  it("starts active with zero counters and an unshown summary", async () => {
    const user = await seedSystemUser(testDb);

    const [run] = await testDb
      .insert(checkRuns)
      .values({ userId: user.id })
      .returning();

    expect(run).toMatchObject({
      finishedAt: null,
      summaryShownAt: null,
      sourcesTotal: 0,
      sourcesChecked: 0,
      sourcesFailed: 0,
      newVacancies: 0,
      removedVacancies: 0,
    });
    expect(run.startedAt).toBeInstanceOf(Date);
  });

  it("refuses a second active run for the same user", async () => {
    // Одна загальна перевірка одночасно на користувача (docs/checks-and-queue.md,
    // розділ 8) - тримає база, тож два одночасні Check all не проскочать.
    const user = await seedSystemUser(testDb);
    await testDb.insert(checkRuns).values({ userId: user.id });

    await expect(
      testDb.insert(checkRuns).values({ userId: user.id }),
    ).rejects.toMatchObject(UNIQUE_VIOLATION);
  });

  it("allows a new run once the previous one has finished", async () => {
    const user = await seedSystemUser(testDb);
    const [first] = await testDb
      .insert(checkRuns)
      .values({ userId: user.id })
      .returning();
    await testDb
      .update(checkRuns)
      .set({ finishedAt: new Date() })
      .where(eq(checkRuns.id, first.id));

    await testDb.insert(checkRuns).values({ userId: user.id });

    expect(await testDb.select().from(checkRuns)).toHaveLength(2);
  });
});
