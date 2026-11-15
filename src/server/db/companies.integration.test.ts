import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { careerSources, companies, users } from "./schema.ts";
import { seedSystemUser } from "./system-user.ts";
import { testDb } from "./testing/test-db.ts";

// Головна адреса зберігається разом зі шляхом, а нормалізована форма - окремо:
// bosch.com/de і bosch.com/ua - різні компанії (docs/discovery-and-parsing.md, розділ 5).
const BOSCH = {
  name: "Bosch",
  url: "https://www.bosch.com/de/",
  normalizedUrl: "bosch.com/de",
};

// Коди помилок PostgreSQL. Drizzle обертає помилку драйвера у власну
// DrizzleQueryError, тому код лежить у `cause`, а не на верхньому рівні.
const UNIQUE_VIOLATION = { cause: { code: "23505" } };
const CHECK_VIOLATION = { cause: { code: "23514" } };

describe("companies", () => {
  it("starts as not checked, because discovery has not run yet", async () => {
    const user = await seedSystemUser(testDb);

    const [company] = await testDb
      .insert(companies)
      .values({ userId: user.id, ...BOSCH })
      .returning();

    expect(company.discoveryStatus).toBe("not_checked");
    // Адреса лишається такою, як її ввів користувач, зі шляхом.
    expect(company.url).toBe(BOSCH.url);
  });

  it("refuses a second company with the same normalized url for one user", async () => {
    const user = await seedSystemUser(testDb);
    await testDb.insert(companies).values({ userId: user.id, ...BOSCH });

    await expect(
      testDb
        .insert(companies)
        .values({ userId: user.id, ...BOSCH, name: "Bosch duplicate" }),
    ).rejects.toMatchObject(UNIQUE_VIOLATION);
  });

  it("lets two users keep the same company, because data is isolated per user", async () => {
    const owner = await seedSystemUser(testDb);
    const [other] = await testDb
      .insert(users)
      .values({ email: "other@job-digger.local" })
      .returning();

    await testDb.insert(companies).values({ userId: owner.id, ...BOSCH });
    await testDb.insert(companies).values({ userId: other.id, ...BOSCH });

    expect(await testDb.select().from(companies)).toHaveLength(2);
  });

  it("refuses a blank name, so the list never shows an empty row", async () => {
    const user = await seedSystemUser(testDb);

    await expect(
      testDb
        .insert(companies)
        .values({ userId: user.id, ...BOSCH, name: "   " }),
    ).rejects.toMatchObject(CHECK_VIOLATION);
  });

  it("is removed together with its owner", async () => {
    const user = await seedSystemUser(testDb);
    await testDb.insert(companies).values({ userId: user.id, ...BOSCH });

    await testDb.delete(users).where(eq(users.id, user.id));

    expect(await testDb.select().from(companies)).toHaveLength(0);
  });
});

describe("career_sources", () => {
  async function insertCompany() {
    const user = await seedSystemUser(testDb);
    const [company] = await testDb
      .insert(companies)
      .values({ userId: user.id, ...BOSCH })
      .returning();

    return company;
  }

  it("starts tracked, with no failures and no successful check yet", async () => {
    const company = await insertCompany();

    const [source] = await testDb
      .insert(careerSources)
      .values({
        companyId: company.id,
        url: "https://boards.greenhouse.io/bosch",
        platform: "greenhouse",
      })
      .returning();

    expect(source.isTracked).toBe(true);
    expect(source.consecutiveFailures).toBe(0);
    // Поки джерело не перевірили успішно, показувати «Last ok» нічим.
    expect(source.lastSuccessAt).toBeNull();
  });

  it("keeps an unsupported page without tracking it", async () => {
    const company = await insertCompany();

    const [source] = await testDb
      .insert(careerSources)
      .values({
        companyId: company.id,
        url: "https://bosch.com/careers",
        platform: "unsupported",
        isTracked: false,
      })
      .returning();

    expect(source.isTracked).toBe(false);
  });

  it("is removed together with its company", async () => {
    const company = await insertCompany();
    await testDb.insert(careerSources).values({
      companyId: company.id,
      url: "https://boards.greenhouse.io/bosch",
      platform: "greenhouse",
    });

    await testDb.delete(companies).where(eq(companies.id, company.id));

    expect(await testDb.select().from(careerSources)).toHaveLength(0);
  });
});
