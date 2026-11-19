import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { careerSources, companies, users } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { normalizedSourceUrl } from "../db/testing/career-source-values.ts";
import { testDb } from "../db/testing/test-db.ts";
import { addCareerSource, addCareerSources } from "./sources.ts";

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

  it("refuses a page that already belongs to another company", async () => {
    const user = await seedSystemUser(testDb);
    const mozilla = await insertCompany(user.id, "Mozilla", "mozilla");
    const bosch = await insertCompany(user.id, "Bosch", "bosch");

    const result = await addCareerSource(testDb, {
      userId: user.id,
      companyId: bosch.id,
      // Сторінка Mozilla, записана інакше: порівняння по очищеній формі.
      url: "https://www.boards.greenhouse.io/mozilla/",
    });

    expect(result).toMatchObject({
      ok: false,
      problem: "source-taken",
      company: { id: mozilla.id, name: "Mozilla" },
    });
    expect(await readSources(bosch.id)).toHaveLength(1);
  });
});

describe("addCareerSources", () => {
  it("adds every picked page as a source of the company", async () => {
    const user = await seedSystemUser(testDb);
    const company = await insertCompany(user.id, "Acme");

    const result = await addCareerSources(testDb, {
      userId: user.id,
      companyId: company.id,
      sources: [
        { url: "https://jobs.lever.co/acme" },
        { url: "https://jobs.ashbyhq.com/acme" },
      ],
    });

    expect(result).toEqual({ ok: true });
    expect((await readSources(company.id)).map((s) => s.platform)).toEqual(
      expect.arrayContaining(["greenhouse", "lever", "ashby"]),
    );
  });

  it("takes the same page written twice as one source", async () => {
    const user = await seedSystemUser(testDb);
    const company = await insertCompany(user.id, "Acme");

    await addCareerSources(testDb, {
      userId: user.id,
      companyId: company.id,
      sources: [
        { url: "https://jobs.lever.co/acme" },
        { url: "https://www.jobs.lever.co/acme/" },
      ],
    });

    expect(await readSources(company.id)).toHaveLength(2);
  });

  it("adds nothing when one of the pages belongs to another company", async () => {
    const user = await seedSystemUser(testDb);
    const company = await insertCompany(user.id, "Acme");
    const other = await insertCompany(user.id, "Globex", "globex");

    const result = await addCareerSources(testDb, {
      userId: user.id,
      companyId: company.id,
      sources: [
        { url: "https://jobs.lever.co/acme" },
        { url: "https://boards.greenhouse.io/globex" },
      ],
    });

    // Усе або нічого: перше джерело не лишається доданим наполовину.
    expect(result).toEqual({
      ok: false,
      problem: "source-taken",
      company: { id: other.id, name: "Globex" },
    });
    expect(await readSources(company.id)).toHaveLength(1);
  });

  it("adds nothing when one of the pages is unusable", async () => {
    const user = await seedSystemUser(testDb);
    const company = await insertCompany(user.id, "Acme");

    const result = await addCareerSources(testDb, {
      userId: user.id,
      companyId: company.id,
      sources: [{ url: "https://jobs.lever.co/acme" }, { url: "ftp://acme" }],
    });

    expect(result).toMatchObject({ ok: false, problem: "source-url" });
    expect(await readSources(company.id)).toHaveLength(1);
  });
});
