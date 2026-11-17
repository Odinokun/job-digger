import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { careerSources, companies, users } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { normalizedSourceUrl } from "../db/testing/career-source-values.ts";
import { testDb } from "../db/testing/test-db.ts";
import { addCareerSource } from "./sources.ts";

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

  await testDb.insert(careerSources).values({
    companyId: company.id,
    url: `https://boards.greenhouse.io/${slug}`,
    normalizedUrl: normalizedSourceUrl(`https://boards.greenhouse.io/${slug}`),
    platform: "greenhouse",
  });

  return company;
}

async function readSources(companyId: string) {
  return testDb
    .select()
    .from(careerSources)
    .where(eq(careerSources.companyId, companyId));
}

describe("addCareerSource", () => {
  it("adds the address as another source of the company", async () => {
    const user = await seedSystemUser(testDb);
    const company = await insertCompany(user.id, "Mozilla", "mozilla");

    const result = await addCareerSource(testDb, {
      userId: user.id,
      companyId: company.id,
      url: "https://www.mozilla.org/en-US/careers/listings/?location=Remote%20US",
      label: "  Remote US  ",
    });

    expect(result).toEqual({ ok: true });
    expect(await readSources(company.id)).toContainEqual(
      expect.objectContaining({
        url: "https://www.mozilla.org/en-US/careers/listings/?location=Remote%20US",
        label: "Remote US",
        platform: "unsupported",
        isTracked: false,
      }),
    );
  });

  it("takes no label as no label", async () => {
    const user = await seedSystemUser(testDb);
    const company = await insertCompany(user.id, "Acme");

    await addCareerSource(testDb, {
      userId: user.id,
      companyId: company.id,
      url: "jobs.lever.co/acme",
    });

    expect(await readSources(company.id)).toContainEqual(
      expect.objectContaining({
        url: "https://jobs.lever.co/acme",
        label: null,
        platform: "lever",
        isTracked: true,
      }),
    );
  });

  it("refuses an address it cannot use", async () => {
    const user = await seedSystemUser(testDb);
    const company = await insertCompany(user.id, "Acme");

    const result = await addCareerSource(testDb, {
      userId: user.id,
      companyId: company.id,
      url: "ftp://acme.com/jobs",
    });

    expect(result).toEqual({
      ok: false,
      problem: "source-url",
      reason: "unsupported-scheme",
    });
    expect(await readSources(company.id)).toHaveLength(1);
  });

  it("refuses an address the company already has", async () => {
    const user = await seedSystemUser(testDb);
    const company = await insertCompany(user.id, "Acme");

    const result = await addCareerSource(testDb, {
      userId: user.id,
      companyId: company.id,
      url: "https://www.boards.greenhouse.io/acme/",
    });

    expect(result).toEqual({ ok: false, problem: "source-duplicate" });
    expect(await readSources(company.id)).toHaveLength(1);
  });

  // Відповідь однакова для неіснуючої та чужої компанії: інакше вона
  // підказувала б, що такий рядок у базі є.
  it("never adds a source to another user's company", async () => {
    const owner = await seedSystemUser(testDb);
    const [stranger] = await testDb
      .insert(users)
      .values({ email: "other@job-digger.local" })
      .returning();
    const theirs = await insertCompany(stranger.id, "Bosch", "bosch");

    const result = await addCareerSource(testDb, {
      userId: owner.id,
      companyId: theirs.id,
      url: "jobs.lever.co/bosch",
    });

    expect(result).toEqual({ ok: false, problem: "not-found" });
    expect(await readSources(theirs.id)).toHaveLength(1);
  });

  it("answers not-found for a company that is gone", async () => {
    const user = await seedSystemUser(testDb);

    const result = await addCareerSource(testDb, {
      userId: user.id,
      companyId: "00000000-0000-0000-0000-000000000000",
      url: "jobs.lever.co/acme",
    });

    expect(result).toEqual({ ok: false, problem: "not-found" });
  });
});
