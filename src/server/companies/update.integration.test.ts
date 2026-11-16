import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { careerSources, companies, users } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { testDb } from "../db/testing/test-db.ts";
import { listCompanies } from "./list.ts";
import { updateCompany } from "./update.ts";

/** Компанія з одним відстежуваним джерелом. */
async function insertCompany(userId: string, name: string, slug = "acme") {
  const [company] = await testDb
    .insert(companies)
    .values({
      userId,
      name,
      url: `https://${slug}.com`,
      normalizedUrl: `${slug}.com`,
    })
    .returning();

  const [source] = await testDb
    .insert(careerSources)
    .values({
      companyId: company.id,
      url: `https://boards.greenhouse.io/${slug}`,
      platform: "greenhouse",
    })
    .returning();

  return { company, source };
}

async function readCompany(id: string) {
  const [row] = await testDb
    .select()
    .from(companies)
    .where(eq(companies.id, id));

  return row;
}

async function readSources(companyId: string) {
  return testDb
    .select()
    .from(careerSources)
    .where(eq(careerSources.companyId, companyId));
}

describe("updateCompany", () => {
  it("renames the company", async () => {
    const user = await seedSystemUser(testDb);
    const { company } = await insertCompany(user.id, "Acme");

    const result = await updateCompany(testDb, {
      userId: user.id,
      companyId: company.id,
      name: "Acme Corp",
    });

    expect(result).toEqual({ ok: true });
    expect((await readCompany(company.id)).name).toBe("Acme Corp");
  });

  it("trims the new name", async () => {
    const user = await seedSystemUser(testDb);
    const { company } = await insertCompany(user.id, "Acme");

    await updateCompany(testDb, {
      userId: user.id,
      companyId: company.id,
      name: "  Acme Corp  ",
    });

    expect((await readCompany(company.id)).name).toBe("Acme Corp");
  });

  it("refuses an empty name and changes nothing", async () => {
    const user = await seedSystemUser(testDb);
    const { company, source } = await insertCompany(user.id, "Acme");

    const result = await updateCompany(testDb, {
      userId: user.id,
      companyId: company.id,
      name: "   ",
      removeSourceIds: [source.id],
    });

    expect(result).toEqual({ ok: false, problem: "name-required" });
    expect((await readCompany(company.id)).name).toBe("Acme");
    // Джерело теж на місці: відмова не має виконати половину роботи.
    expect(await readSources(company.id)).toHaveLength(1);
  });

  it("removes the asked-for sources", async () => {
    const user = await seedSystemUser(testDb);
    const { company, source } = await insertCompany(user.id, "Acme");
    const [kept] = await testDb
      .insert(careerSources)
      .values({
        companyId: company.id,
        url: "https://jobs.lever.co/acme",
        platform: "lever",
      })
      .returning();

    const result = await updateCompany(testDb, {
      userId: user.id,
      companyId: company.id,
      name: "Acme",
      removeSourceIds: [source.id],
    });

    expect(result).toEqual({ ok: true });
    expect((await readSources(company.id)).map((row) => row.id)).toEqual([
      kept.id,
    ]);
  });

  it("sends a company with no sources left to Not tracked", async () => {
    const user = await seedSystemUser(testDb);
    const { company, source } = await insertCompany(user.id, "Acme");
    // Статус із попереднього пошуку сторінок: після видалення джерел він
    // більше не описує стан компанії.
    await testDb
      .update(companies)
      .set({ discoveryStatus: "check_failed" })
      .where(eq(companies.id, company.id));

    await updateCompany(testDb, {
      userId: user.id,
      companyId: company.id,
      name: "Acme",
      removeSourceIds: [source.id],
    });

    expect((await readCompany(company.id)).discoveryStatus).toBe("not_checked");

    const { items } = await listCompanies(testDb, {
      userId: user.id,
      tab: "not-tracked",
    });

    expect(items.map((listed) => listed.name)).toEqual(["Acme"]);
  });

  it("keeps the discovery status while a source is left", async () => {
    const user = await seedSystemUser(testDb);
    const { company } = await insertCompany(user.id, "Acme");
    await testDb
      .update(companies)
      .set({ discoveryStatus: "not_found" })
      .where(eq(companies.id, company.id));

    await updateCompany(testDb, {
      userId: user.id,
      companyId: company.id,
      name: "Acme Corp",
    });

    expect((await readCompany(company.id)).discoveryStatus).toBe("not_found");
  });

  it("ignores a source id that belongs to another company", async () => {
    const user = await seedSystemUser(testDb);
    const mine = await insertCompany(user.id, "Acme", "acme");
    const other = await insertCompany(user.id, "Bosch", "bosch");

    const result = await updateCompany(testDb, {
      userId: user.id,
      companyId: mine.company.id,
      name: "Acme",
      removeSourceIds: [other.source.id],
    });

    expect(result).toEqual({ ok: true });
    expect(await readSources(other.company.id)).toHaveLength(1);
  });

  it("never touches another user's company", async () => {
    const owner = await seedSystemUser(testDb);
    const [stranger] = await testDb
      .insert(users)
      .values({ email: "other@job-digger.local" })
      .returning();
    const theirs = await insertCompany(stranger.id, "Bosch", "bosch");

    const result = await updateCompany(testDb, {
      userId: owner.id,
      companyId: theirs.company.id,
      name: "Renamed",
      removeSourceIds: [theirs.source.id],
    });

    expect(result).toEqual({ ok: false, problem: "not-found" });
    expect((await readCompany(theirs.company.id)).name).toBe("Bosch");
    expect(await readSources(theirs.company.id)).toHaveLength(1);
  });
});
