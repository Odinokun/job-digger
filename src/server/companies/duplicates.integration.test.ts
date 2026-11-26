import { describe, expect, it } from "vitest";

import { companies, users } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { testDb } from "../db/testing/test-db.ts";
import { findCompaniesByName, findCompanyUrlConflict } from "./duplicates.ts";

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

    // bosch.com.ua only starts the same way - it is a different domain.
    const conflict = await findCompanyUrlConflict(testDb, {
      userId: user.id,
      normalizedUrl: "bosch.com.ua/jobs",
    });

    expect(conflict).toEqual({ kind: "none" });
  });

  it("lists every company on that domain, sorted by name", async () => {
    const user = await seedSystemUser(testDb);
    // Inserted out of alphabetical order, so the order in the warning is the code's choice.
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

describe("findCompaniesByName", () => {
  it("finds a company with the same name, ignoring case and spaces", async () => {
    const user = await seedSystemUser(testDb);

    await testDb.insert(companies).values({
      userId: user.id,
      name: "Linear",
      url: "https://linear.app",
      normalizedUrl: "linear.app",
    });

    const found = await findCompaniesByName(testDb, {
      userId: user.id,
      name: "  linear ",
    });

    // The name is the only thing two cards of one company share when one has no
    // site and the other no career source (card 2.17).
    expect(found).toMatchObject([{ name: "Linear" }]);
  });

  it("sees one company behind differently written names", async () => {
    const user = await seedSystemUser(testDb);

    await testDb.insert(companies).values({
      userId: user.id,
      name: "Rolls-Royce",
      url: "https://rolls-roycemotorcars.com",
      normalizedUrl: "rolls-roycemotorcars.com",
    });

    // Hyphens and spaces in a name mean nothing: the user wrote the same company
    // differently.
    for (const typed of ["Rolls Royce", "rollsroyce", "  ROLLS-ROYCE "]) {
      expect(
        await findCompaniesByName(testDb, { userId: user.id, name: typed }),
      ).toMatchObject([{ name: "Rolls-Royce" }]);
    }
  });

  it("does not see a company of another user", async () => {
    const owner = await seedSystemUser(testDb);
    const [stranger] = await testDb
      .insert(users)
      .values({ email: "stranger@job-digger.local" })
      .returning();

    await testDb.insert(companies).values({
      userId: stranger.id,
      name: "Linear",
      url: "https://linear.app",
      normalizedUrl: "linear.app",
    });

    expect(
      await findCompaniesByName(testDb, { userId: owner.id, name: "Linear" }),
    ).toEqual([]);
  });

  it("finds nothing when the name is new", async () => {
    const user = await seedSystemUser(testDb);

    expect(
      await findCompaniesByName(testDb, { userId: user.id, name: "Linear" }),
    ).toEqual([]);
  });
});
