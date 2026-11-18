import { describe, expect, it } from "vitest";

import type { JobsTab } from "../../lib/vacancies/vacancy-list.ts";
import { careerSources, companies, users, vacancies } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { testDb } from "../db/testing/test-db.ts";
import { hasAnyVacancy, listVacancies } from "./list.ts";

/** Джерело компанії користувача - повертає його id. */
async function sourceOf(userId: string, companyName: string): Promise<string> {
  const slug = companyName.toLowerCase();
  const [company] = await testDb
    .insert(companies)
    .values({ userId, name: companyName, url: null, normalizedUrl: null })
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
