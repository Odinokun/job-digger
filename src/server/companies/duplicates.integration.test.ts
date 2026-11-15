import { describe, expect, it } from "vitest";

import { companies, users } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { testDb } from "../db/testing/test-db.ts";
import { findCompanyUrlConflict } from "./duplicates.ts";

const BOSCH_DE = {
  name: "Bosch DE",
  url: "https://www.bosch.com/de/",
  normalizedUrl: "bosch.com/de",
};

describe("findCompanyUrlConflict", () => {
  it("reports an exact match, so the same company is not added twice", async () => {
    const user = await seedSystemUser(testDb);
    const [bosch] = await testDb
      .insert(companies)
      .values({ userId: user.id, ...BOSCH_DE })
      .returning();

    const conflict = await findCompanyUrlConflict(testDb, {
      userId: user.id,
      normalizedUrl: BOSCH_DE.normalizedUrl,
    });

    expect(conflict).toEqual({
      kind: "exact",
      company: { id: bosch.id, name: BOSCH_DE.name, url: BOSCH_DE.url },
    });
  });

  it("reports the same domain with a different path as a warning only", async () => {
    const user = await seedSystemUser(testDb);
    const [bosch] = await testDb
      .insert(companies)
      .values({ userId: user.id, ...BOSCH_DE })
      .returning();

    const conflict = await findCompanyUrlConflict(testDb, {
      userId: user.id,
      normalizedUrl: "bosch.com/ua",
    });

    expect(conflict).toEqual({
      kind: "same-domain",
      companies: [{ id: bosch.id, name: BOSCH_DE.name, url: BOSCH_DE.url }],
    });
  });

  it("does not treat a longer domain as the same domain", async () => {
    const user = await seedSystemUser(testDb);
    await testDb.insert(companies).values({ userId: user.id, ...BOSCH_DE });

    // bosch.com.ua лише починається так само - це інший домен.
    const conflict = await findCompanyUrlConflict(testDb, {
      userId: user.id,
      normalizedUrl: "bosch.com.ua/jobs",
    });

    expect(conflict).toEqual({ kind: "none" });
  });

  it("lists every company on that domain, sorted by name", async () => {
    const user = await seedSystemUser(testDb);
    // Вставлені не за алфавітом, щоб порядок у попередженні був саме вибором коду.
    await testDb.insert(companies).values([
      { userId: user.id, ...BOSCH_DE },
      {
        userId: user.id,
        name: "Bosch AT",
        url: "https://bosch.com/at",
        normalizedUrl: "bosch.com/at",
      },
    ]);

    const conflict = await findCompanyUrlConflict(testDb, {
      userId: user.id,
      normalizedUrl: "bosch.com/ua",
    });

    expect(conflict).toMatchObject({
      kind: "same-domain",
      companies: [{ name: "Bosch AT" }, { name: "Bosch DE" }],
    });
  });

  it("ignores another user's company, because data is isolated", async () => {
    const owner = await seedSystemUser(testDb);
    const [other] = await testDb
      .insert(users)
      .values({ email: "other@job-digger.local" })
      .returning();
    await testDb.insert(companies).values({ userId: other.id, ...BOSCH_DE });

    const conflict = await findCompanyUrlConflict(testDb, {
      userId: owner.id,
      normalizedUrl: BOSCH_DE.normalizedUrl,
    });

    expect(conflict).toEqual({ kind: "none" });
  });
});
