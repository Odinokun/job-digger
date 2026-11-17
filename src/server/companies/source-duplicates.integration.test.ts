import { describe, expect, it } from "vitest";

import { careerSources, companies, users } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { normalizedSourceUrl } from "../db/testing/career-source-values.ts";
import { testDb } from "../db/testing/test-db.ts";
import { findCompanyWithSource } from "./source-duplicates.ts";

/** Компанія без сайту з одним карʼєрним джерелом - випадок із картки 2.17. */
async function insertCompanyWithSource(
  userId: string,
  name: string,
  sourceUrl: string,
) {
  const [company] = await testDb
    .insert(companies)
    .values({ userId, name })
    .returning();

  await testDb.insert(careerSources).values({
    companyId: company.id,
    url: sourceUrl,
    normalizedUrl: normalizedSourceUrl(sourceUrl),
    platform: "lever",
  });

  return company;
}

describe("findCompanyWithSource", () => {
  it("names the company that already has this career page", async () => {
    const user = await seedSystemUser(testDb);
    const spotify = await insertCompanyWithSource(
      user.id,
      "Spotify",
      "https://jobs.lever.co/spotify",
    );

    const found = await findCompanyWithSource(testDb, {
      userId: user.id,
      normalizedUrl: normalizedSourceUrl("https://jobs.lever.co/spotify"),
    });

    expect(found).toEqual({ id: spotify.id, name: "Spotify" });
  });

  it("compares cleaned addresses, not what was typed", async () => {
    const user = await seedSystemUser(testDb);
    await insertCompanyWithSource(
      user.id,
      "Spotify",
      "https://jobs.lever.co/spotify",
    );

    // `www.` і кінцевий слеш нічого не міняють: це та сама сторінка.
    const found = await findCompanyWithSource(testDb, {
      userId: user.id,
      normalizedUrl: normalizedSourceUrl("https://www.jobs.lever.co/spotify/"),
    });

    expect(found).toMatchObject({ name: "Spotify" });
  });

  it("does not see a career page of another user", async () => {
    const owner = await seedSystemUser(testDb);
    const [stranger] = await testDb
      .insert(users)
      .values({ email: "stranger@job-digger.local" })
      .returning();

    await insertCompanyWithSource(
      stranger.id,
      "Spotify",
      "https://jobs.lever.co/spotify",
    );

    const found = await findCompanyWithSource(testDb, {
      userId: owner.id,
      normalizedUrl: normalizedSourceUrl("https://jobs.lever.co/spotify"),
    });

    // Дані ізольовані за користувачем: чуже джерело тут не існує.
    expect(found).toBeNull();
  });

  it("skips the company the source is being added to", async () => {
    const user = await seedSystemUser(testDb);
    const spotify = await insertCompanyWithSource(
      user.id,
      "Spotify",
      "https://jobs.lever.co/spotify",
    );

    // Власне джерело компанії дублікатом *між* компаніями не є: його ловить
    // `prepareCareerSource` і каже про це інакше.
    const found = await findCompanyWithSource(testDb, {
      userId: user.id,
      normalizedUrl: normalizedSourceUrl("https://jobs.lever.co/spotify"),
      exceptCompanyId: spotify.id,
    });

    expect(found).toBeNull();
  });

  it("finds nothing when no company has the page", async () => {
    const user = await seedSystemUser(testDb);
    await insertCompanyWithSource(
      user.id,
      "Spotify",
      "https://jobs.lever.co/spotify",
    );

    const found = await findCompanyWithSource(testDb, {
      userId: user.id,
      normalizedUrl: normalizedSourceUrl("https://jobs.lever.co/netflix"),
    });

    expect(found).toBeNull();
  });
});
