import { describe, expect, it } from "vitest";

import { settings, users } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { testDb } from "../db/testing/test-db.ts";
import { getSettings, setAutoCheckInterval } from "./settings.ts";

describe("settings", () => {
  it("gives the defaults before the user chose anything", async () => {
    // Рядка ще немає: налаштування зʼявляються в базі лише з першим вибором.
    const user = await seedSystemUser(testDb);

    expect(await getSettings(testDb, user.id)).toEqual({
      autoCheckIntervalHours: 6,
    });
  });

  it("remembers the chosen interval", async () => {
    const user = await seedSystemUser(testDb);

    await setAutoCheckInterval(testDb, user.id, 12);

    expect(await getSettings(testDb, user.id)).toEqual({
      autoCheckIntervalHours: 12,
    });
  });

  it("overwrites an earlier choice", async () => {
    const user = await seedSystemUser(testDb);

    await setAutoCheckInterval(testDb, user.id, 12);
    await setAutoCheckInterval(testDb, user.id, 3);

    expect(await getSettings(testDb, user.id)).toEqual({
      autoCheckIntervalHours: 3,
    });
  });

  it("keeps each user's settings apart", async () => {
    const owner = await seedSystemUser(testDb);
    const [other] = await testDb
      .insert(users)
      .values({ email: "other@job-digger.local" })
      .returning();

    await setAutoCheckInterval(testDb, other.id, 24);

    expect(await getSettings(testDb, owner.id)).toEqual({
      autoCheckIntervalHours: 6,
    });
  });

  it("lets the database refuse an interval off the list", async () => {
    // Запис поза нашим кодом теж не має покласти в базу 5 годин.
    const user = await seedSystemUser(testDb);

    await expect(
      testDb
        .insert(settings)
        .values({ userId: user.id, autoCheckIntervalHours: 5 }),
    ).rejects.toThrow();
  });
});
