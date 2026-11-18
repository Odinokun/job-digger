import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { careerSources, companies, users, vacancies } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { testDb } from "../db/testing/test-db.ts";
import {
  findVacancy,
  listUnreadIds,
  markVacanciesRead,
  setVacancyFavorite,
  setVacancyRead,
} from "./marks.ts";

const DETECTED = new Date("2026-11-18T10:00:00Z");

/** Вакансія компанії системного користувача. */
async function seedVacancy(
  marks: { isRead?: boolean; isFavorite?: boolean; closedAt?: Date } = {},
) {
  const user = await seedSystemUser(testDb);
  const [company] = await testDb
    .insert(companies)
    .values({
      userId: user.id,
      name: "Discord",
      url: null,
      normalizedUrl: null,
    })
    .returning();
  const [source] = await testDb
    .insert(careerSources)
    .values({
      companyId: company.id,
      url: "https://job-boards.greenhouse.io/discord",
      normalizedUrl: "job-boards.greenhouse.io/discord",
      platform: "greenhouse",
    })
    .returning();
  const [vacancy] = await testDb
    .insert(vacancies)
    .values({
      sourceId: source.id,
      key: "id:1",
      title: "Account Executive",
      url: "https://job-boards.greenhouse.io/discord/jobs/1",
      firstDetectedAt: DETECTED,
      lastSeenAt: DETECTED,
      ...marks,
    })
    .returning();

  return { userId: user.id, vacancyId: vacancy.id };
}

async function stranger() {
  const [row] = await testDb
    .insert(users)
    .values({ email: "stranger@job-digger.local" })
    .returning();

  return row.id;
}

async function stored(vacancyId: string) {
  const [row] = await testDb
    .select()
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId));

  return row;
}

describe("findVacancy", () => {
  it("returns the row the Jobs list shows", async () => {
    const { userId, vacancyId } = await seedVacancy();

    expect(await findVacancy(testDb, { userId, vacancyId })).toEqual({
      id: vacancyId,
      title: "Account Executive",
      url: "https://job-boards.greenhouse.io/discord/jobs/1",
      location: null,
      companyName: "Discord",
      firstDetectedAt: DETECTED,
      isRead: false,
      isFavorite: false,
      closedAt: null,
    });
  });

  it("does not find another user's vacancy", async () => {
    const { vacancyId } = await seedVacancy();

    expect(
      await findVacancy(testDb, { userId: await stranger(), vacancyId }),
    ).toBeNull();
  });
});

describe("setVacancyRead", () => {
  it("marks a vacancy as read and back, returning the new row", async () => {
    const { userId, vacancyId } = await seedVacancy({ isFavorite: true });

    const read = await setVacancyRead(testDb, {
      userId,
      vacancyId,
      isRead: true,
    });
    expect(read).toMatchObject({
      id: vacancyId,
      isRead: true,
      isFavorite: true,
    });

    const unread = await setVacancyRead(testDb, {
      userId,
      vacancyId,
      isRead: false,
    });
    expect(unread).toMatchObject({ isRead: false, isFavorite: true });
  });

  it("changes only the read mark", async () => {
    const { userId, vacancyId } = await seedVacancy();
    const before = await stored(vacancyId);

    await setVacancyRead(testDb, { userId, vacancyId, isRead: true });

    expect(await stored(vacancyId)).toEqual({ ...before, isRead: true });
  });

  it("does nothing to another user's vacancy", async () => {
    const { vacancyId } = await seedVacancy();

    const result = await setVacancyRead(testDb, {
      userId: await stranger(),
      vacancyId,
      isRead: true,
    });

    expect(result).toBeNull();
    expect((await stored(vacancyId)).isRead).toBe(false);
  });

  it("answers null for a vacancy that is gone", async () => {
    const { userId } = await seedVacancy();

    expect(
      await setVacancyRead(testDb, {
        userId,
        vacancyId: "00000000-0000-4000-8000-000000000000",
        isRead: true,
      }),
    ).toBeNull();
  });
});

describe("vacancy id from the client", () => {
  it("answers null for a malformed id instead of failing in the database", async () => {
    const { userId } = await seedVacancy();

    expect(
      await findVacancy(testDb, { userId, vacancyId: "1 or 1=1" }),
    ).toBeNull();
    expect(
      await setVacancyRead(testDb, { userId, vacancyId: "nope", isRead: true }),
    ).toBeNull();
  });
});

const CLOSED = new Date("2026-11-18T12:00:00Z");

describe("setVacancyFavorite", () => {
  it("adds a vacancy to Favorites, returning the new row", async () => {
    const { userId, vacancyId } = await seedVacancy({ isRead: true });

    const row = await setVacancyFavorite(testDb, {
      userId,
      vacancyId,
      isFavorite: true,
    });

    expect(row).toMatchObject({
      id: vacancyId,
      isFavorite: true,
      isRead: true,
    });
  });

  it("changes only the favorite mark", async () => {
    const { userId, vacancyId } = await seedVacancy();
    const before = await stored(vacancyId);

    await setVacancyFavorite(testDb, { userId, vacancyId, isFavorite: true });

    expect(await stored(vacancyId)).toEqual({ ...before, isFavorite: true });
  });

  it("removes an active vacancy from Favorites and keeps it", async () => {
    const { userId, vacancyId } = await seedVacancy({ isFavorite: true });

    const row = await setVacancyFavorite(testDb, {
      userId,
      vacancyId,
      isFavorite: false,
    });

    expect(row).toMatchObject({ id: vacancyId, isFavorite: false });
    expect(await stored(vacancyId)).toBeDefined();
  });

  it("deletes a closed vacancy once it leaves Favorites", async () => {
    // Закрита вакансія жила лише заради Favorites: зник сайт - зникає й вона.
    const { userId, vacancyId } = await seedVacancy({
      isFavorite: true,
      closedAt: CLOSED,
    });

    const row = await setVacancyFavorite(testDb, {
      userId,
      vacancyId,
      isFavorite: false,
    });

    expect(row).toBeNull();
    expect(await stored(vacancyId)).toBeUndefined();
  });

  it("keeps a vacancy the check has just reopened", async () => {
    // Перевірка зняла Closed, бо вакансія повернулася на сайт, поки рядок ще
    // висів у списку як закритий. Рішення - за станом у базі, а не в списку.
    const { userId, vacancyId } = await seedVacancy({
      isFavorite: true,
      closedAt: CLOSED,
    });
    await testDb
      .update(vacancies)
      .set({ closedAt: null })
      .where(eq(vacancies.id, vacancyId));

    const row = await setVacancyFavorite(testDb, {
      userId,
      vacancyId,
      isFavorite: false,
    });

    expect(row).toMatchObject({
      id: vacancyId,
      isFavorite: false,
      closedAt: null,
    });
  });

  it("does nothing to another user's vacancy", async () => {
    const { vacancyId } = await seedVacancy({
      isFavorite: true,
      closedAt: CLOSED,
    });

    const row = await setVacancyFavorite(testDb, {
      userId: await stranger(),
      vacancyId,
      isFavorite: false,
    });

    expect(row).toBeNull();
    expect(await stored(vacancyId)).toMatchObject({ isFavorite: true });
  });
});

/**
 * Кілька вакансій в одному джерелі однієї компанії системного користувача -
 * по одній на кожен набір позначок.
 */
async function seedVacancies(
  ...marks: Array<{ isRead?: boolean; isFavorite?: boolean; closedAt?: Date }>
) {
  const user = await seedSystemUser(testDb);
  const [company] = await testDb
    .insert(companies)
    .values({
      userId: user.id,
      name: "Discord",
      url: null,
      normalizedUrl: null,
    })
    .returning();
  const [source] = await testDb
    .insert(careerSources)
    .values({
      companyId: company.id,
      url: "https://job-boards.greenhouse.io/discord",
      normalizedUrl: "job-boards.greenhouse.io/discord",
      platform: "greenhouse",
    })
    .returning();
  const rows = await testDb
    .insert(vacancies)
    .values(
      marks.map((mark, index) => ({
        sourceId: source.id,
        key: `id:${index + 1}`,
        title: `Job ${index + 1}`,
        url: `https://job-boards.greenhouse.io/discord/jobs/${index + 1}`,
        firstDetectedAt: DETECTED,
        lastSeenAt: DETECTED,
        ...mark,
      })),
    )
    .returning();

  return { userId: user.id, ids: rows.map((row) => row.id) };
}

describe("listUnreadIds", () => {
  it("lists every vacancy of the Unread tab, not just a loaded page", async () => {
    const { userId, ids } = await seedVacancies(
      {},
      { isFavorite: true },
      { isRead: true },
      // Закрита живе лише у Favorites, у вкладці Unread її немає.
      { closedAt: DETECTED, isFavorite: true },
      {},
    );

    expect((await listUnreadIds(testDb, { userId })).sort()).toEqual(
      [ids[0], ids[1], ids[4]].sort(),
    );
  });

  it("does not list another user's vacancies", async () => {
    await seedVacancies({}, {});

    expect(await listUnreadIds(testDb, { userId: await stranger() })).toEqual(
      [],
    );
  });
});

describe("markVacanciesRead", () => {
  it("marks exactly the given vacancies and reports how many", async () => {
    const { userId, ids } = await seedVacancies({}, {}, {});

    // Третя з'явилася після знімка - вона лишається Unread.
    const marked = await markVacanciesRead(testDb, {
      userId,
      ids: [ids[0], ids[1]],
    });

    expect(marked).toBe(2);
    expect((await stored(ids[0])).isRead).toBe(true);
    expect((await stored(ids[1])).isRead).toBe(true);
    expect((await stored(ids[2])).isRead).toBe(false);
  });

  it("changes only the read mark", async () => {
    const { userId, ids } = await seedVacancies({ isFavorite: true });
    const before = await stored(ids[0]);

    await markVacanciesRead(testDb, { userId, ids });

    expect(await stored(ids[0])).toEqual({ ...before, isRead: true });
  });

  it("does not touch another user's vacancies", async () => {
    const { ids } = await seedVacancies({});

    const marked = await markVacanciesRead(testDb, {
      userId: await stranger(),
      ids,
    });

    expect(marked).toBe(0);
    expect((await stored(ids[0])).isRead).toBe(false);
  });

  it("skips vacancies that are gone and ids that are not ids", async () => {
    // Перевірка видалила вакансію, поки був відкритий діалог, - без помилки.
    const { userId, ids } = await seedVacancies({}, {});
    await testDb.delete(vacancies).where(eq(vacancies.id, ids[1]));

    const marked = await markVacanciesRead(testDb, {
      userId,
      ids: [ids[0], ids[1], "not-a-uuid"],
    });

    expect(marked).toBe(1);
  });

  it("does nothing for an empty list", async () => {
    const { userId, ids } = await seedVacancies({});

    expect(await markVacanciesRead(testDb, { userId, ids: [] })).toBe(0);
    expect((await stored(ids[0])).isRead).toBe(false);
  });
});
