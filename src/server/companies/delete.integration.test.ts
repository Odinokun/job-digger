import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { careerSources, companies, users } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { normalizedSourceUrl } from "../db/testing/career-source-values.ts";
import { testDb } from "../db/testing/test-db.ts";
import { deleteCompany } from "./delete.ts";

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
      normalizedUrl: normalizedSourceUrl(
        `https://boards.greenhouse.io/${slug}`,
      ),
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

describe("deleteCompany", () => {
  it("deletes the company with its career sources", async () => {
    const user = await seedSystemUser(testDb);
    const { company } = await insertCompany(user.id, "Acme");

    const result = await deleteCompany(testDb, {
      userId: user.id,
      companyId: company.id,
    });

    expect(result).toEqual({ ok: true });
    expect(await readCompany(company.id)).toBeUndefined();
    // Джерела прибирає каскад на `career_sources.company_id`: окремого
    // видалення в коді немає, тому перевіряє його саме цей тест.
    expect(await readSources(company.id)).toEqual([]);
  });

  it("refuses a company of another user and leaves it in place", async () => {
    const owner = await seedSystemUser(testDb);
    const [stranger] = await testDb
      .insert(users)
      .values({ email: "stranger@job-digger.local" })
      .returning();
    const { company } = await insertCompany(owner.id, "Acme");

    const result = await deleteCompany(testDb, {
      userId: stranger.id,
      companyId: company.id,
    });

    expect(result).toEqual({ ok: false, problem: "not-found" });
    expect(await readCompany(company.id)).toMatchObject({ name: "Acme" });
  });

  it("refuses a company that does not exist", async () => {
    const user = await seedSystemUser(testDb);

    const result = await deleteCompany(testDb, {
      userId: user.id,
      companyId: "00000000-0000-0000-0000-000000000000",
    });

    expect(result).toEqual({ ok: false, problem: "not-found" });
  });
});
