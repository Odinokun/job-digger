import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { seedSystemUser } from "../db/system-user.ts";
import { testDb } from "../db/testing/test-db.ts";
import { careerSources, companies, users } from "../db/schema.ts";
import { addCompany } from "./add.ts";

async function user(): Promise<string> {
  return (await seedSystemUser(testDb)).id;
}

async function sourcesOf(companyId: string) {
  return testDb
    .select()
    .from(careerSources)
    .where(eq(careerSources.companyId, companyId));
}

/**
 * Waits until an insert into `companies` from a neighbouring connection queues
 * behind the unique index lock.
 *
 * It polls `pg_stat_activity` rather than using a timer: otherwise the test could
 * pass through the friendly duplicate check and say nothing about the race. The
 * query runs outside a transaction - inside one the statistics come from a
 * cached snapshot that does not have the neighbouring connection yet.
 */
async function waitForBlockedInsert(): Promise<void> {
  const deadline = Date.now() + 8_000;

  while (Date.now() < deadline) {
    const blocked = await testDb.execute(
      sql`select 1 from pg_stat_activity
          where wait_event_type = 'Lock' and query ilike '%insert into "companies"%'`,
    );

    if (blocked.rows.length > 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error("The competing insert never waited for the unique index");
}

describe("addCompany", () => {
  it("saves the company together with its career page", async () => {
    const userId = await user();

    const result = await addCompany(testDb, {
      userId,
      name: "Spotify",
      url: "https://www.spotify.com",
      careerUrl: "https://jobs.lever.co/spotify",
    });

    expect(result).toEqual({ ok: true, companyId: expect.any(String) });
    if (!result.ok) return;

    const [company] = await testDb
      .select()
      .from(companies)
      .where(eq(companies.id, result.companyId));
    expect(company.name).toBe("Spotify");
    expect(company.url).toBe("https://www.spotify.com");
    // The normalized form is only needed to compare duplicates.
    expect(company.normalizedUrl).toBe("spotify.com");
    expect(company.discoveryStatus).toBe("not_checked");

    const sources = await sourcesOf(result.companyId);
    expect(sources).toHaveLength(1);
    // The platform is visible from the address, so the source is tracked right away.
    expect(sources[0].platform).toBe("lever");
    expect(sources[0].isTracked).toBe(true);
  });

  it("stores an address typed without a scheme as an absolute one", async () => {
    const userId = await user();

    const result = await addCompany(testDb, {
      userId,
      name: "GitLab",
      url: "about.gitlab.com",
      careerUrl: "job-boards.greenhouse.io/gitlab",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [company] = await testDb
      .select()
      .from(companies)
      .where(eq(companies.id, result.companyId));
    // Otherwise the link in the company list would be relative and lead nowhere.
    expect(company.url).toBe("https://about.gitlab.com");
    expect((await sourcesOf(result.companyId))[0].url).toBe(
      "https://job-boards.greenhouse.io/gitlab",
    );
  });

  it("keeps a career page we cannot read without tracking it", async () => {
    const userId = await user();

    const result = await addCompany(testDb, {
      userId,
      name: "Spotify",
      url: "https://www.spotify.com",
      careerUrl: "https://www.lifeatspotify.com/jobs",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [source] = await sourcesOf(result.companyId);
    expect(source.platform).toBe("unsupported");
    expect(source.isTracked).toBe(false);
  });

  it("tracks a page its content showed to be PeopleForce (task 5.13)", async () => {
    const userId = await user();

    const result = await addCompany(testDb, {
      userId,
      name: "SoftConstruct",
      url: "https://www.softconstruct.com",
      careerUrl: "https://peopleforce.softconstruct.com/careers",
      pagePlatforms: new Map([
        ["peopleforce.softconstruct.com/careers", "peopleforce"],
      ]),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [source] = await sourcesOf(result.companyId);
    expect(source.platform).toBe("peopleforce");
    expect(source.isTracked).toBe(true);
  });

  it("saves a company without a career page at all", async () => {
    const userId = await user();

    const result = await addCompany(testDb, {
      userId,
      name: "Berkshire Hathaway",
      url: "https://www.berkshirehathaway.com",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(await sourcesOf(result.companyId)).toHaveLength(0);
    const [company] = await testDb
      .select()
      .from(companies)
      .where(eq(companies.id, result.companyId));
    // There has been no page search yet, so Not checked, not Not found.
    expect(company.discoveryStatus).toBe("not_checked");
  });

  it("treats a blank career page as none", async () => {
    const userId = await user();

    const result = await addCompany(testDb, {
      userId,
      name: "Valve",
      url: "https://www.valvesoftware.com",
      careerUrl: "   ",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await sourcesOf(result.companyId)).toHaveLength(0);
  });

  it("refuses a blank name", async () => {
    const userId = await user();

    const result = await addCompany(testDb, {
      userId,
      name: "   ",
      url: "https://www.valvesoftware.com",
    });

    expect(result).toEqual({ ok: false, problem: "name-required" });
    expect(await testDb.select().from(companies)).toHaveLength(0);
  });

  it("trims the name, because the database refuses a blank one", async () => {
    const userId = await user();

    const result = await addCompany(testDb, {
      userId,
      name: "  Valve  ",
      url: "https://www.valvesoftware.com",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [company] = await testDb
      .select()
      .from(companies)
      .where(eq(companies.id, result.companyId));
    expect(company.name).toBe("Valve");
  });

  it("refuses a company address it cannot use", async () => {
    const userId = await user();

    expect(
      await addCompany(testDb, { userId, name: "Valve", url: "не адреса" }),
    ).toEqual({ ok: false, problem: "company-url", reason: "not-a-url" });
    expect(
      await addCompany(testDb, {
        userId,
        name: "Valve",
        url: "ftp://valvesoftware.com",
      }),
    ).toEqual({
      ok: false,
      problem: "company-url",
      reason: "unsupported-scheme",
    });
  });

  it("saves nothing when the career address is unusable", async () => {
    const userId = await user();

    const result = await addCompany(testDb, {
      userId,
      name: "Valve",
      url: "https://www.valvesoftware.com",
      careerUrl: "javascript:alert(1)",
    });

    expect(result).toEqual({
      ok: false,
      problem: "career-url",
      reason: "unsupported-scheme",
    });
    // Addresses are checked before the insert, otherwise a company without a source would be left.
    expect(await testDb.select().from(companies)).toHaveLength(0);
  });

  it("refuses a company that is already added", async () => {
    const userId = await user();
    await addCompany(testDb, {
      userId,
      name: "Spotify",
      url: "https://www.spotify.com",
    });

    const result = await addCompany(testDb, {
      userId,
      name: "Spotify again",
      // The same company written differently: www and a slash change nothing.
      url: "spotify.com/",
    });

    expect(result).toMatchObject({
      ok: false,
      problem: "already-added",
      company: { name: "Spotify", url: "https://www.spotify.com" },
    });
    expect(await testDb.select().from(companies)).toHaveLength(1);
  });

  it("warns about other companies on the same domain instead of saving", async () => {
    const userId = await user();
    await addCompany(testDb, {
      userId,
      name: "Bosch DE",
      url: "https://www.bosch.com/de",
    });

    const result = await addCompany(testDb, {
      userId,
      name: "Bosch UA",
      url: "https://www.bosch.com/ua",
    });

    expect(result).toMatchObject({
      ok: false,
      problem: "same-domain",
      companies: [{ name: "Bosch DE" }],
    });
    expect(await testDb.select().from(companies)).toHaveLength(1);
  });

  it("saves once the same-domain warning is confirmed", async () => {
    const userId = await user();
    await addCompany(testDb, {
      userId,
      name: "Bosch DE",
      url: "https://www.bosch.com/de",
    });

    const result = await addCompany(testDb, {
      userId,
      name: "Bosch UA",
      url: "https://www.bosch.com/ua",
      confirmed: true,
    });

    expect(result.ok).toBe(true);
    expect(await testDb.select().from(companies)).toHaveLength(2);
  });

  it("does not let a confirmation push through an exact duplicate", async () => {
    const userId = await user();
    await addCompany(testDb, {
      userId,
      name: "Spotify",
      url: "https://www.spotify.com",
    });

    const result = await addCompany(testDb, {
      userId,
      name: "Spotify again",
      url: "https://www.spotify.com",
      confirmed: true,
    });

    expect(result).toMatchObject({ ok: false, problem: "already-added" });
    expect(await testDb.select().from(companies)).toHaveLength(1);
  });

  it("falls back to the unique index when a parallel request wins the race", async () => {
    const userId = await user();
    // A separate connection plays another request - of the same or another user.
    const rival = await testDb.$client.connect();

    try {
      // Rival has inserted the company but not committed yet: exactly the moment
      // the friendly duplicate check cannot see.
      await rival.query("begin");
      await rival.query(
        `insert into companies (user_id, name, url, normalized_url)
         values ($1, $2, $3, $4)`,
        [userId, "Spotify", "https://www.spotify.com", "spotify.com"],
      );

      const pending = addCompany(testDb, {
        userId,
        name: "Spotify",
        url: "https://www.spotify.com",
        careerUrl: "https://jobs.lever.co/spotify",
      });

      // We wait for the lock itself, not a timer: without this the test could
      // pass through the friendly check and say nothing about the race.
      await waitForBlockedInsert();
      await rival.query("commit");

      expect(await pending).toMatchObject({
        ok: false,
        problem: "already-added",
        company: { name: "Spotify" },
      });
      expect(await testDb.select().from(companies)).toHaveLength(1);
      // The second attempt left no orphaned source behind.
      expect(await testDb.select().from(careerSources)).toHaveLength(0);
    } finally {
      await rival.query("rollback").catch(() => undefined);
      rival.release();
    }
  });

  it("does not see a company of another user as a conflict", async () => {
    const owner = await user();
    const [stranger] = await testDb
      .insert(users)
      .values({ email: "stranger@job-digger.local" })
      .returning();
    await addCompany(testDb, {
      userId: stranger.id,
      name: "Spotify",
      url: "https://www.spotify.com",
    });

    const result = await addCompany(testDb, {
      userId: owner,
      name: "Spotify",
      url: "https://www.spotify.com",
    });

    // Data is isolated per user, so this is not a duplicate.
    expect(result.ok).toBe(true);
    expect(await testDb.select().from(companies)).toHaveLength(2);
  });

  it("refuses a company without a site, even with a career page (task company-site-required)", async () => {
    const userId = await user();

    const result = await addCompany(testDb, {
      userId,
      name: "Spotify",
      url: "   ",
      careerUrl: "jobs.lever.co/spotify",
    });

    // The site is required: a company found only on an ATS can no longer be
    // added without one (the author's decision of 21.11.2026; before that, card 2.17).
    expect(result).toEqual({
      ok: false,
      problem: "company-url",
      reason: "empty",
    });
    expect(await testDb.select().from(companies)).toHaveLength(0);
  });

  it("refuses a site it cannot use", async () => {
    const userId = await user();

    const result = await addCompany(testDb, {
      userId,
      name: "Spotify",
      url: "ftp://spotify.com",
      careerUrl: "jobs.lever.co/spotify",
    });

    expect(result).toEqual({
      ok: false,
      problem: "company-url",
      reason: "unsupported-scheme",
    });
    expect(await testDb.select().from(companies)).toHaveLength(0);
  });

  it("refuses a career page that already belongs to another company", async () => {
    const userId = await user();

    await addCompany(testDb, {
      userId,
      name: "Spotify",
      url: "spotify.com",
      careerUrl: "jobs.lever.co/spotify",
    });

    const result = await addCompany(testDb, {
      userId,
      name: "Spotify Technology",
      url: "spotify-technology.com",
      // The same page written differently: the comparison uses the normalized form.
      careerUrl: "https://www.jobs.lever.co/spotify/",
    });

    // This is exactly what keeps away twins of a company nothing else tells apart:
    // without a site, the career page is its whole identity (card 2.17).
    expect(result).toMatchObject({
      ok: false,
      problem: "source-taken",
      company: { name: "Spotify" },
    });
    expect(await testDb.select().from(companies)).toHaveLength(1);
  });

  it("warns about a company with the same name instead of saving", async () => {
    const userId = await user();

    await addCompany(testDb, {
      userId,
      name: "Linear",
      url: "linear.io",
      careerUrl: "jobs.ashbyhq.com/linear",
    });

    const result = await addCompany(testDb, {
      userId,
      name: "Linear",
      url: "linear.app",
    });

    // The sites differ (linear.io and linear.app are different domains), and there
    // is no shared source. Only the name matches - and that is the only signal
    // that this is the same company (card 2.17).
    expect(result).toMatchObject({
      ok: false,
      problem: "same-name",
      companies: [{ name: "Linear" }],
    });
    expect(await testDb.select().from(companies)).toHaveLength(1);
  });

  it("saves once the same-name warning is confirmed", async () => {
    const userId = await user();

    await addCompany(testDb, {
      userId,
      name: "Linear",
      url: "linear.io",
      careerUrl: "jobs.ashbyhq.com/linear",
    });

    const result = await addCompany(testDb, {
      userId,
      name: "Linear",
      url: "linear.app",
      confirmed: true,
    });

    // Two different companies may have the same name, so this is a warning, not
    // a ban.
    expect(result.ok).toBe(true);
    expect(await testDb.select().from(companies)).toHaveLength(2);
  });

  it("does not let a confirmation push through an exact duplicate", async () => {
    const userId = await user();

    await addCompany(testDb, { userId, name: "Bosch", url: "bosch.com" });

    const result = await addCompany(testDb, {
      userId,
      name: "Bosch",
      url: "bosch.com",
      confirmed: true,
    });

    // An exact address match does not give way to a confirmation - neither this
    // one nor the one that passes the domain warning.
    expect(result).toMatchObject({ ok: false, problem: "already-added" });
  });

  it("does not warn about a name taken by another user", async () => {
    const owner = await user();
    const [stranger] = await testDb
      .insert(users)
      .values({ email: "stranger@job-digger.local" })
      .returning();

    await addCompany(testDb, {
      userId: stranger.id,
      name: "Linear",
      url: "linear.app",
    });

    const result = await addCompany(testDb, {
      userId: owner,
      name: "Linear",
      url: "linear.io",
      careerUrl: "jobs.ashbyhq.com/linear",
    });

    expect(result.ok).toBe(true);
  });

  describe("with pages found by Find pages", () => {
    it("saves every chosen page together with the typed one", async () => {
      const userId = await user();

      const result = await addCompany(testDb, {
        userId,
        name: "Spotify",
        url: "https://www.spotify.com",
        careerUrl: "jobs.lever.co/spotify",
        // The same board as in the field - one source, not two.
        foundUrls: [
          "https://jobs.lever.co/spotify",
          "https://job-boards.greenhouse.io/spotify",
        ],
      });

      expect(result).toEqual({ ok: true, companyId: expect.any(String) });
      if (!result.ok) return;

      const sources = await sourcesOf(result.companyId);
      expect(
        sources.map(({ url, platform, isTracked }) => ({
          url,
          platform,
          isTracked,
        })),
      ).toEqual([
        {
          url: "https://jobs.lever.co/spotify",
          platform: "lever",
          isTracked: true,
        },
        {
          url: "https://job-boards.greenhouse.io/spotify",
          platform: "greenhouse",
          isTracked: true,
        },
      ]);
    });

    it("refuses a found page that already belongs to another company", async () => {
      const userId = await user();
      await addCompany(testDb, {
        userId,
        name: "Spotify",
        url: "spotify.com",
        careerUrl: "jobs.lever.co/spotify",
      });

      const result = await addCompany(testDb, {
        userId,
        name: "Spotify AB",
        url: "spotify.se",
        foundUrls: ["https://jobs.lever.co/spotify"],
      });

      expect(result).toMatchObject({
        ok: false,
        problem: "source-taken",
        company: { name: "Spotify" },
      });
      expect(await testDb.select().from(companies)).toHaveLength(1);
    });

    it("refuses a found address it cannot use", async () => {
      // Findings come from the client, so they are checked the same way as the field.
      const userId = await user();

      const result = await addCompany(testDb, {
        userId,
        name: "Acme",
        url: "https://acme.example",
        foundUrls: ["ftp://acme.example/jobs"],
      });

      expect(result).toEqual({
        ok: false,
        problem: "career-url",
        reason: "unsupported-scheme",
      });
      expect(await testDb.select().from(companies)).toHaveLength(0);
    });
  });
});
