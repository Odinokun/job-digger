import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { JobsTab } from "../../lib/vacancies/vacancy-list.ts";
import { careerSources, companies, users, vacancies } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { testDb } from "../db/testing/test-db.ts";
import { countVacanciesByTab, hasAnyVacancy, listVacancies } from "./list.ts";
import { companySiteValues } from "../db/testing/company-values.ts";

/** Джерело компанії користувача - повертає його id. */
async function sourceOf(userId: string, companyName: string): Promise<string> {
  const slug = companyName.toLowerCase();
  const [company] = await testDb
    .insert(companies)
    .values({ userId, name: companyName, ...companySiteValues(companyName) })
    .returning();
  const [source] = await testDb
    .insert(careerSources)
    .values({
      companyId: company.id,
      url: `https://job-boards.greenhouse.io/${slug}`,
      normalizedUrl: `job-boards.greenhouse.io/${slug}`,
      platform: "greenhouse",
    })
    .returning();

  return source.id;
}

interface VacancySeed {
  title: string;
  detected?: Date;
  isRead?: boolean;
  isFavorite?: boolean;
  closedAt?: Date | null;
  location?: string | null;
}

async function addVacancy(sourceId: string, seed: VacancySeed) {
  const detected = seed.detected ?? new Date("2026-11-18T10:00:00Z");
  const [row] = await testDb
    .insert(vacancies)
    .values({
      sourceId,
      key: `id:${seed.title}`,
      title: seed.title,
      url: `https://job-boards.greenhouse.io/jobs/${encodeURIComponent(seed.title)}`,
      location: seed.location ?? null,
      firstDetectedAt: detected,
      lastSeenAt: detected,
      isRead: seed.isRead ?? false,
      isFavorite: seed.isFavorite ?? false,
      closedAt: seed.closedAt ?? null,
    })
    .returning();

  return row;
}

async function titlesIn(userId: string, tab: JobsTab) {
  const { items } = await listVacancies(testDb, { userId, tab });

  return items.map((item) => item.title);
}

const CLOSED = new Date("2026-11-18T12:00:00Z");

describe("listVacancies tabs", () => {
  async function seedEveryKind() {
    const user = await seedSystemUser(testDb);
    const sourceId = await sourceOf(user.id, "Discord");
    await addVacancy(sourceId, { title: "Unread" });
    await addVacancy(sourceId, { title: "Read", isRead: true });
    await addVacancy(sourceId, { title: "Unread favorite", isFavorite: true });
    await addVacancy(sourceId, {
      title: "Read favorite",
      isRead: true,
      isFavorite: true,
    });
    await addVacancy(sourceId, {
      title: "Closed favorite",
      isFavorite: true,
      closedAt: CLOSED,
    });

    return user.id;
  }

  it("shows active unread vacancies on Unread", async () => {
    const userId = await seedEveryKind();

    expect((await titlesIn(userId, "unread")).sort()).toEqual([
      "Unread",
      "Unread favorite",
    ]);
  });

  it("shows active read vacancies on Read", async () => {
    const userId = await seedEveryKind();

    expect((await titlesIn(userId, "read")).sort()).toEqual([
      "Read",
      "Read favorite",
    ]);
  });

  it("shows every favorite on Favorites, closed ones too", async () => {
    const userId = await seedEveryKind();

    expect((await titlesIn(userId, "favorites")).sort()).toEqual([
      "Closed favorite",
      "Read favorite",
      "Unread favorite",
    ]);
  });

  it("shows every active vacancy on All", async () => {
    const userId = await seedEveryKind();

    expect((await titlesIn(userId, "all")).sort()).toEqual([
      "Read",
      "Read favorite",
      "Unread",
      "Unread favorite",
    ]);
  });

  it("never shows another user's vacancies", async () => {
    const userId = await seedEveryKind();
    const [stranger] = await testDb
      .insert(users)
      .values({ email: "stranger@job-digger.local" })
      .returning();

    expect(await titlesIn(stranger.id, "all")).toEqual([]);
    expect((await titlesIn(userId, "all")).length).toBe(4);
  });
});

describe("listVacancies rows", () => {
  it("carries what the row shows, the company name included", async () => {
    const user = await seedSystemUser(testDb);
    const sourceId = await sourceOf(user.id, "Discord");
    const detected = new Date("2026-11-17T08:30:00Z");
    const added = await addVacancy(sourceId, {
      title: "Account Executive",
      location: "Remote",
      detected,
    });

    const { items } = await listVacancies(testDb, {
      userId: user.id,
      tab: "unread",
    });

    expect(items).toEqual([
      {
        id: added.id,
        title: "Account Executive",
        url: added.url,
        location: "Remote",
        companyName: "Discord",
        firstDetectedAt: detected,
        isRead: false,
        isFavorite: false,
        favoritedAt: null,
        closedAt: null,
      },
    ]);
  });

  it("puts the newest detected vacancy first", async () => {
    const user = await seedSystemUser(testDb);
    const sourceId = await sourceOf(user.id, "Discord");
    await addVacancy(sourceId, {
      title: "Old",
      detected: new Date("2026-11-01T10:00:00Z"),
    });
    await addVacancy(sourceId, {
      title: "New",
      detected: new Date("2026-11-03T10:00:00Z"),
    });
    await addVacancy(sourceId, {
      title: "Middle",
      detected: new Date("2026-11-02T10:00:00Z"),
    });

    expect(await titlesIn(user.id, "unread")).toEqual(["New", "Middle", "Old"]);
  });
});

describe("countVacanciesByTab", () => {
  it("counts the rows of every tab", async () => {
    const user = await seedSystemUser(testDb);
    const sourceId = await sourceOf(user.id, "Discord");
    await addVacancy(sourceId, { title: "Unread" });
    await addVacancy(sourceId, { title: "Another unread" });
    await addVacancy(sourceId, { title: "Read", isRead: true });
    await addVacancy(sourceId, { title: "Unread favorite", isFavorite: true });
    await addVacancy(sourceId, {
      title: "Closed favorite",
      isFavorite: true,
      closedAt: CLOSED,
    });

    expect(await countVacanciesByTab(testDb, user.id)).toEqual({
      unread: 3,
      read: 1,
      favorites: 2,
      all: 4,
    });
  });

  it("counts nothing for a user without vacancies", async () => {
    const user = await seedSystemUser(testDb);
    await addVacancy(await sourceOf(user.id, "Discord"), { title: "Designer" });
    const [stranger] = await testDb
      .insert(users)
      .values({ email: "stranger@job-digger.local" })
      .returning();

    expect(await countVacanciesByTab(testDb, stranger.id)).toEqual({
      unread: 0,
      read: 0,
      favorites: 0,
      all: 0,
    });
  });
});

describe("hasAnyVacancy", () => {
  it("tells whether the user has any vacancy at all", async () => {
    const user = await seedSystemUser(testDb);

    expect(await hasAnyVacancy(testDb, user.id)).toBe(false);

    const sourceId = await sourceOf(user.id, "Discord");
    await addVacancy(sourceId, { title: "Designer", isRead: true });

    expect(await hasAnyVacancy(testDb, user.id)).toBe(true);
  });

  it("does not count another user's vacancies", async () => {
    const user = await seedSystemUser(testDb);
    await addVacancy(await sourceOf(user.id, "Discord"), { title: "Designer" });
    const [stranger] = await testDb
      .insert(users)
      .values({ email: "stranger@job-digger.local" })
      .returning();

    expect(await hasAnyVacancy(testDb, stranger.id)).toBe(false);
  });
});

describe("listVacancies pagination", () => {
  /** `count` вакансій з різними датами; повертає назви від найновішої. */
  async function seedMany(userId: string, count: number) {
    const sourceId = await sourceOf(userId, "Discord");
    for (let i = 0; i < count; i += 1) {
      await addVacancy(sourceId, {
        title: `Job ${String(i).padStart(2, "0")}`,
        detected: new Date(Date.UTC(2026, 10, 1, 0, i)),
      });
    }

    return Array.from(
      { length: count },
      (_, i) => `Job ${String(count - 1 - i).padStart(2, "0")}`,
    );
  }

  /** Усі порції вкладки Unread по `limit` рядків, курсор за курсором. */
  async function walk(userId: string, limit: number) {
    const titles: string[] = [];
    let after = null;
    do {
      const page = await listVacancies(testDb, {
        userId,
        tab: "unread",
        limit,
        after,
      });
      titles.push(...page.items.map((item) => item.title));
      after = page.nextCursor;
    } while (after !== null);

    return titles;
  }

  it("hands back a cursor while more vacancies are left", async () => {
    const user = await seedSystemUser(testDb);
    await seedMany(user.id, 3);

    const page = await listVacancies(testDb, {
      userId: user.id,
      tab: "unread",
      limit: 2,
    });

    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();
  });

  it("has no cursor on the last portion", async () => {
    const user = await seedSystemUser(testDb);
    await seedMany(user.id, 2);

    const page = await listVacancies(testDb, {
      userId: user.id,
      tab: "unread",
      limit: 2,
    });

    expect(page.nextCursor).toBeNull();
  });

  it("continues after the cursor without a gap or a repeat", async () => {
    const user = await seedSystemUser(testDb);
    const expected = await seedMany(user.id, 7);

    expect(await walk(user.id, 3)).toEqual(expected);
  });

  it("walks through vacancies detected at the same moment", async () => {
    // Одна перевірка дає всім вакансіям джерела однакову дату виявлення -
    // звичайний випадок, а не рідкісний.
    const user = await seedSystemUser(testDb);
    const sourceId = await sourceOf(user.id, "Discord");
    for (let i = 0; i < 5; i += 1) {
      await addVacancy(sourceId, { title: `Same ${i}` });
    }

    const titles = await walk(user.id, 2);

    expect(titles).toHaveLength(5);
    expect(new Set(titles).size).toBe(5);
  });

  it("keeps microseconds of the detection time in the cursor", async () => {
    // База зберігає час до мікросекунд, JS Date - лише до мілісекунд. Якби
    // курсор губив мікросекунди, рядок на межі порції повторювався б.
    const user = await seedSystemUser(testDb);
    const sourceId = await sourceOf(user.id, "Discord");
    for (const [title, time] of [
      ["First", "2026-11-18 10:00:00.000100+00"],
      ["Second", "2026-11-18 10:00:00.000200+00"],
      ["Third", "2026-11-18 10:00:00.000300+00"],
    ]) {
      const row = await addVacancy(sourceId, { title });
      await testDb.execute(
        sql`update ${vacancies} set first_detected_at = ${time}::timestamptz where id = ${row.id}`,
      );
    }

    expect(await walk(user.id, 1)).toEqual(["Third", "Second", "First"]);
  });

  it("starts from the beginning when the cursor is not usable", async () => {
    const user = await seedSystemUser(testDb);
    const expected = await seedMany(user.id, 2);
    const [first] = (
      await listVacancies(testDb, { userId: user.id, tab: "unread" })
    ).items;

    const page = await listVacancies(testDb, {
      userId: user.id,
      tab: "unread",
      after: { key: "not a date", id: first.id },
    });

    expect(page.items.map((item) => item.title)).toEqual(expected);
  });
});
