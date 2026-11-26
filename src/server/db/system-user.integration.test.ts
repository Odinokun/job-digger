import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { SYSTEM_USER_EMAIL, users } from "./schema.ts";
import { getSystemUser, seedSystemUser } from "./system-user.ts";
import { testDb } from "./testing/test-db.ts";

describe("seedSystemUser", () => {
  it("creates the system user on an empty database", async () => {
    const user = await seedSystemUser(testDb);

    expect(user.email).toBe(SYSTEM_USER_EMAIL);
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("keeps a single row with the same id when run twice", async () => {
    const first = await seedSystemUser(testDb);
    const second = await seedSystemUser(testDb);

    expect(second.id).toBe(first.id);

    const rows = await testDb
      .select()
      .from(users)
      .where(eq(users.email, SYSTEM_USER_EMAIL));

    expect(rows).toHaveLength(1);
  });
});

describe("getSystemUser", () => {
  it("returns the seeded user", async () => {
    const seeded = await seedSystemUser(testDb);

    const user = await getSystemUser(testDb);

    expect(user.id).toBe(seeded.id);
  });

  it("explains how to fix an unseeded database instead of failing deeper", async () => {
    // Pages only read the user, so an empty database has to say what exactly to
    // run rather than fail somewhere in a query further down.
    await expect(getSystemUser(testDb)).rejects.toThrow(/db:seed/);
  });
});
