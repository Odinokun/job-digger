import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { SYSTEM_USER_EMAIL, users } from "./schema.ts";
import { seedSystemUser } from "./system-user.ts";
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
