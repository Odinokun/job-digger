import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { CareerPlatform } from "../../lib/companies/platform.ts";
import { careerSources, companies, vacancies } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { untilSomeoneWaitsForLock } from "../db/testing/locks.ts";
import { testDb } from "../db/testing/test-db.ts";
import type { ParsedVacancy, ParseResult } from "../parsers/types.ts";
import { syncSourceVacancies } from "./lifecycle.ts";
import { companySiteValues } from "../db/testing/company-values.ts";

/**
 * Duplicates across the sources of one company (task 6.20): the same title on
 * PeopleForce, DOU and the site is one unread vacancy, the rest are read.
 */

const FIRST_CHECK = new Date("2026-11-01T10:00:00Z");
const SECOND_CHECK = new Date("2026-11-02T10:00:00Z");

async function company(name = "Kinggroup"): Promise<string> {
  const user = await seedSystemUser(testDb);
  const [row] = await testDb
    .insert(companies)
    .values({ userId: user.id, name, ...companySiteValues(name) })
    .returning();

  return row.id;
}

async function source(
  companyId: string,
  platform: CareerPlatform,
  slug: string,
): Promise<string> {
  const url = `https://${slug}.example/careers`;
  const [row] = await testDb
    .insert(careerSources)
    .values({
      companyId,
      url,
      normalizedUrl: `${slug}.example/careers`,
      platform,
    })
    .returning();

  return row.id;
}

function vacancy(externalId: string, title: string): ParsedVacancy {
  return {
    externalId,
    title,
    url: `https://jobs.example/${externalId}`,
    location: null,
  };
}

function ok(...list: ParsedVacancy[]): ParseResult {
  return { ok: true, vacancies: list, skipped: 0 };
}

async function readMarks(sourceId: string) {
  return testDb
    .select({ title: vacancies.title, isRead: vacancies.isRead })
    .from(vacancies)
    .where(eq(vacancies.sourceId, sourceId))
    .orderBy(vacancies.title);
}

describe("duplicates across sources of a company", () => {
  it("stores a later duplicate as read and does not count it as new", async () => {
    const kinggroup = await company();
    const peopleforce = await source(kinggroup, "peopleforce", "pf");
    const dou = await source(kinggroup, "lever", "dou");

    await syncSourceVacancies(testDb, {
      sourceId: peopleforce,
      result: ok(vacancy("1", "Frontend Developer")),
      checkedAt: FIRST_CHECK,
    });
    const counts = await syncSourceVacancies(testDb, {
      sourceId: dou,
      result: ok(
        // Case and extra spaces do not make the title different.
        vacancy("a", "  frontend   DEVELOPER "),
        vacancy("b", "React Native developer"),
      ),
      checkedAt: SECOND_CHECK,
    });

    expect(counts.newVacancies).toBe(1);
    expect(await readMarks(peopleforce)).toEqual([
      { title: "Frontend Developer", isRead: false },
    ]);
    expect(await readMarks(dou)).toEqual([
      { title: "  frontend   DEVELOPER ", isRead: true },
      { title: "React Native developer", isRead: false },
    ]);
  });

  it("keeps the platform vacancy unread and reads its site duplicate", async () => {
    const kinggroup = await company();
    const site = await source(kinggroup, "schema_org", "site");
    const peopleforce = await source(kinggroup, "peopleforce", "pf");

    await syncSourceVacancies(testDb, {
      sourceId: site,
      result: ok(vacancy("s1", "Frontend Developer")),
      checkedAt: FIRST_CHECK,
    });
    const counts = await syncSourceVacancies(testDb, {
      sourceId: peopleforce,
      result: ok(vacancy("1", "Frontend Developer")),
      checkedAt: SECOND_CHECK,
    });

    expect(counts.newVacancies).toBe(1);
    expect(await readMarks(peopleforce)).toEqual([
      { title: "Frontend Developer", isRead: false },
    ]);
    expect(await readMarks(site)).toEqual([
      { title: "Frontend Developer", isRead: true },
    ]);
  });

  it("does not touch the same title in another company", async () => {
    const first = await source(await company("Kinggroup"), "peopleforce", "pf");
    const second = await source(await company("Boosters"), "lever", "lv");

    await syncSourceVacancies(testDb, {
      sourceId: first,
      result: ok(vacancy("1", "Frontend Developer")),
      checkedAt: FIRST_CHECK,
    });
    await syncSourceVacancies(testDb, {
      sourceId: second,
      result: ok(vacancy("1", "Frontend Developer")),
      checkedAt: SECOND_CHECK,
    });

    expect(await readMarks(second)).toEqual([
      { title: "Frontend Developer", isRead: false },
    ]);
  });

  it("does not treat two vacancies of one source as duplicates", async () => {
    // The same source can have two vacancies with one title in different cities.
    const peopleforce = await source(await company(), "peopleforce", "pf");

    await syncSourceVacancies(testDb, {
      sourceId: peopleforce,
      result: ok(
        vacancy("1", "Finance Controller"),
        vacancy("2", "Finance Controller"),
      ),
      checkedAt: FIRST_CHECK,
    });

    expect(await readMarks(peopleforce)).toEqual([
      { title: "Finance Controller", isRead: false },
      { title: "Finance Controller", isRead: false },
    ]);
  });

  it("ignores a closed vacancy kept in Favorites", async () => {
    // A closed vacancy lives only in Favorites: it is no longer on the site, and a
    // new one with the same title is a genuinely new vacancy.
    const kinggroup = await company();
    const peopleforce = await source(kinggroup, "peopleforce", "pf");
    const dou = await source(kinggroup, "lever", "dou");
    await syncSourceVacancies(testDb, {
      sourceId: peopleforce,
      result: ok(vacancy("1", "Frontend Developer")),
      checkedAt: FIRST_CHECK,
    });
    await testDb
      .update(vacancies)
      .set({ isFavorite: true, closedAt: FIRST_CHECK })
      .where(eq(vacancies.sourceId, peopleforce));

    await syncSourceVacancies(testDb, {
      sourceId: dou,
      result: ok(vacancy("a", "Frontend Developer")),
      checkedAt: SECOND_CHECK,
    });

    expect(await readMarks(dou)).toEqual([
      { title: "Frontend Developer", isRead: false },
    ]);
  });

  it("does not mark an already known vacancy again", async () => {
    // The rule is for freshly discovered ones. A vacancy the user put back into
    // Unread is not marked read again by the next check.
    const kinggroup = await company();
    const peopleforce = await source(kinggroup, "peopleforce", "pf");
    const dou = await source(kinggroup, "lever", "dou");
    await syncSourceVacancies(testDb, {
      sourceId: peopleforce,
      result: ok(vacancy("1", "Frontend Developer")),
      checkedAt: FIRST_CHECK,
    });
    await syncSourceVacancies(testDb, {
      sourceId: dou,
      result: ok(vacancy("a", "Frontend Developer")),
      checkedAt: FIRST_CHECK,
    });
    await testDb
      .update(vacancies)
      .set({ isRead: false })
      .where(eq(vacancies.sourceId, dou));

    await syncSourceVacancies(testDb, {
      sourceId: dou,
      result: ok(vacancy("a", "Frontend Developer")),
      checkedAt: SECOND_CHECK,
    });

    expect(await readMarks(dou)).toEqual([
      { title: "Frontend Developer", isRead: false },
    ]);
  });

  it("waits for another source of the company that is being written", async () => {
    // The company's sources are checked in parallel. While another source writes
    // its vacancies (here, an open transaction holding the company row lock), the
    // write waits and then sees its duplicate.
    const kinggroup = await company();
    const peopleforce = await source(kinggroup, "peopleforce", "pf");
    const dou = await source(kinggroup, "lever", "dou");

    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    const otherWriter = testDb.transaction(async (tx) => {
      await tx.execute(
        sql`select 1 from ${companies} where id = ${kinggroup} for no key update`,
      );
      await released;
      await tx.insert(vacancies).values({
        sourceId: peopleforce,
        key: "id:1",
        title: "Frontend Developer",
        url: "https://jobs.example/1",
        firstDetectedAt: FIRST_CHECK,
        lastSeenAt: FIRST_CHECK,
      });
    });

    const sync = syncSourceVacancies(testDb, {
      sourceId: dou,
      result: ok(vacancy("a", "Frontend Developer")),
      checkedAt: SECOND_CHECK,
    });
    await untilSomeoneWaitsForLock();
    release();
    await Promise.all([otherWriter, sync]);

    expect(await readMarks(dou)).toEqual([
      { title: "Frontend Developer", isRead: true },
    ]);
  });
});
