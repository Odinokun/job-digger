import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { DEMO_COMPANIES, seedDemoCompanies } from "./demo-companies.ts";
import { careerSources, companies } from "./schema.ts";
import { seedSystemUser } from "./system-user.ts";
import { testDb } from "./testing/test-db.ts";

const DEMO_SOURCE_COUNT = DEMO_COMPANIES.reduce(
  (total, company) => total + company.sources.length,
  0,
);

async function countCompanies(): Promise<number> {
  return (await testDb.select().from(companies)).length;
}

async function countSources(): Promise<number> {
  return (await testDb.select().from(careerSources)).length;
}

describe("seedDemoCompanies", () => {
  it("fills an empty database with the whole demo set", async () => {
    const user = await seedSystemUser(testDb);

    const inserted = await seedDemoCompanies(testDb, user.id);

    expect(inserted).toEqual({
      companies: DEMO_COMPANIES.length,
      sources: DEMO_SOURCE_COUNT,
    });
    expect(await countCompanies()).toBe(DEMO_COMPANIES.length);
    expect(await countSources()).toBe(DEMO_SOURCE_COUNT);
  });

  it("inserts nothing on a second run", async () => {
    const user = await seedSystemUser(testDb);
    await seedDemoCompanies(testDb, user.id);

    const inserted = await seedDemoCompanies(testDb, user.id);

    expect(inserted).toEqual({ companies: 0, sources: 0 });
    expect(await countCompanies()).toBe(DEMO_COMPANIES.length);
    // На career_sources unique-індексу немає свідомо, тому ідемпотентність
    // джерел тримається на правилі «вже існуючу компанію не торкаємось».
    expect(await countSources()).toBe(DEMO_SOURCE_COUNT);
  });

  it("keeps a company that was added by hand", async () => {
    const user = await seedSystemUser(testDb);
    await testDb.insert(companies).values({
      userId: user.id,
      name: "Acme",
      url: "https://acme.example",
      normalizedUrl: "acme.example",
    });

    await seedDemoCompanies(testDb, user.id);

    const byHand = await testDb
      .select()
      .from(companies)
      .where(eq(companies.normalizedUrl, "acme.example"));
    expect(byHand).toHaveLength(1);
    expect(await countCompanies()).toBe(DEMO_COMPANIES.length + 1);
  });

  it("gives a company with two career pages both of them", async () => {
    const user = await seedSystemUser(testDb);
    await seedDemoCompanies(testDb, user.id);

    const [spotify] = await testDb
      .select()
      .from(companies)
      .where(eq(companies.name, "Spotify"));
    const sources = await testDb
      .select()
      .from(careerSources)
      .where(eq(careerSources.companyId, spotify.id));

    expect(sources.map((source) => source.platform).sort()).toEqual([
      "lever",
      "unsupported",
    ]);
    // Сторінку, яку нічим прочитати, зберігаємо без відстеження.
    const unsupported = sources.find(
      (source) => source.platform === "unsupported",
    );
    expect(unsupported?.isTracked).toBe(false);
  });

  it("leaves a company without career sources when discovery found none", async () => {
    const user = await seedSystemUser(testDb);
    await seedDemoCompanies(testDb, user.id);

    const [berkshire] = await testDb
      .select()
      .from(companies)
      .where(eq(companies.name, "Berkshire Hathaway"));

    expect(berkshire.discoveryStatus).toBe("not_found");
    expect(
      await testDb
        .select()
        .from(careerSources)
        .where(eq(careerSources.companyId, berkshire.id)),
    ).toHaveLength(0);
  });

  it("marks a failing source with its failure count and last success", async () => {
    const user = await seedSystemUser(testDb);
    await seedDemoCompanies(testDb, user.id);

    const [palantir] = await testDb
      .select()
      .from(companies)
      .where(eq(companies.name, "Palantir"));
    const [source] = await testDb
      .select()
      .from(careerSources)
      .where(eq(careerSources.companyId, palantir.id));

    expect(source.consecutiveFailures).toBeGreaterThan(0);
    // «Last ok: N days ago» потрібна дата в минулому, а не null.
    expect(source.lastSuccessAt?.getTime()).toBeLessThan(Date.now());
  });

  it("stores every demo url in its normalized form too", async () => {
    const user = await seedSystemUser(testDb);
    await seedDemoCompanies(testDb, user.id);

    const rows = await testDb.select().from(companies);

    for (const row of rows) {
      expect(row.url).toMatch(/^https:\/\//);
      // Нормалізована форма - без протоколу й без www: ту саму функцію
      // використовує і ручне додавання компанії.
      expect(row.normalizedUrl).not.toMatch(/^https:\/\//);
      expect(row.normalizedUrl).not.toMatch(/^www\./);
    }
  });
});
