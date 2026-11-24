import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { careerSources, companies, users, vacancies } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { testDb } from "../db/testing/test-db.ts";
import {
  findVacancy,
  countRead,
  countUnread,
  markAllRead,
  markAllUnread,
  setCompanyVacanciesRead,
  setVacancyFavorite,
  setVacancyRead,
} from "./marks.ts";
import { companySiteValues } from "../db/testing/company-values.ts";

const DETECTED = new Date("2026-11-18T10:00:00Z");

/** Вакансія компанії системного користувача. */
async function seedVacancy(
  marks: {
    isRead?: boolean;
    isFavorite?: boolean;
    favoritedAt?: Date;
    closedAt?: Date;
  } = {},
) {
  const user = await seedSystemUser(testDb);
  const [company] = await testDb
    .insert(companies)
    .values({
      userId: user.id,
      name: "Discord",
      ...companySiteValues("Discord"),
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
      favoritedAt: null,
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

  it("changes only the favorite mark and when it was set", async () => {
    const { userId, vacancyId } = await seedVacancy();
    const before = await stored(vacancyId);

    await setVacancyFavorite(testDb, { userId, vacancyId, isFavorite: true });

    expect(await stored(vacancyId)).toEqual({
      ...before,
      isFavorite: true,
      favoritedAt: expect.any(Date),
    });
  });

  it("remembers when the vacancy was added to Favorites", async () => {
    const { userId, vacancyId } = await seedVacancy();
    const from = Date.now();

    const row = await setVacancyFavorite(testDb, {
      userId,
      vacancyId,
      isFavorite: true,
    });

    // Час пише база (`now()`), тож допуск - на розбіжність годинників.
    const at = row?.favoritedAt?.getTime() ?? 0;
    expect(at).toBeGreaterThanOrEqual(from - 5_000);
    expect(at).toBeLessThanOrEqual(Date.now() + 5_000);
  });

  it("keeps the time of a vacancy that is already a favorite", async () => {
    // Подвійне натискання чи дві вкладки браузера не мають піднімати вакансію
    // нагору Favorites і робити її «доданою сьогодні».
    const earlier = new Date("2026-11-20T09:00:00Z");
    const { userId, vacancyId } = await seedVacancy({
      isFavorite: true,
      favoritedAt: earlier,
    });

    const row = await setVacancyFavorite(testDb, {
      userId,
      vacancyId,
      isFavorite: true,
    });

    expect(row?.favoritedAt).toEqual(earlier);
  });

  it("forgets the time once the vacancy leaves Favorites", async () => {
    const { userId, vacancyId } = await seedVacancy({
      isFavorite: true,
      favoritedAt: new Date("2026-11-20T09:00:00Z"),
    });

    const row = await setVacancyFavorite(testDb, {
      userId,
      vacancyId,
      isFavorite: false,
    });

    expect(row?.favoritedAt).toBeNull();
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
      ...companySiteValues("Discord"),
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

  return {
    userId: user.id,
    companyId: company.id,
    ids: rows.map((row) => row.id),
  };
}

describe("countUnread", () => {
  it("counts every vacancy of the Unread tab, not just a loaded page", async () => {
    const { userId } = await seedVacancies(
      {},
      { isFavorite: true },
      { isRead: true },
      // Закрита живе лише у Favorites, у вкладці Unread її немає.
      { closedAt: DETECTED, isFavorite: true },
      {},
    );

    const { count, asOf } = await countUnread(testDb, { userId });

    expect(count).toBe(3);
    // Межа - час бази з мікросекундами: JS Date обрізав би їх.
    expect(asOf).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
  });

  it("does not count another user's vacancies", async () => {
    await seedVacancies({}, {});

    expect(
      (await countUnread(testDb, { userId: await stranger() })).count,
    ).toBe(0);
  });
});

describe("markAllRead", () => {
  it("marks the unread vacancies written up to the boundary", async () => {
    const { userId, ids } = await seedVacancies({}, {});
    const { asOf } = await countUnread(testDb, { userId });

    expect(await markAllRead(testDb, { userId, asOf })).toBe(2);
    expect((await stored(ids[0])).isRead).toBe(true);
    expect((await stored(ids[1])).isRead).toBe(true);
  });

  it("leaves unread a vacancy written after the boundary", async () => {
    // Перевірка, що йшла, поки був відкритий діалог: дата виявлення в неї
    // давня (момент старту перевірки), а записана вона вже після межі.
    const { userId, ids } = await seedVacancies({});
    const { asOf } = await countUnread(testDb, { userId });
    const [late] = await testDb
      .insert(vacancies)
      .values({
        sourceId: (await stored(ids[0])).sourceId,
        key: "id:late",
        title: "Found during the dialog",
        url: "https://job-boards.greenhouse.io/discord/jobs/late",
        firstDetectedAt: DETECTED,
        lastSeenAt: DETECTED,
      })
      .returning();

    expect(await markAllRead(testDb, { userId, asOf })).toBe(1);
    expect((await stored(late.id)).isRead).toBe(false);
  });

  it("changes only the read mark", async () => {
    const { userId, ids } = await seedVacancies({ isFavorite: true });
    const before = await stored(ids[0]);
    const { asOf } = await countUnread(testDb, { userId });

    await markAllRead(testDb, { userId, asOf });

    expect(await stored(ids[0])).toEqual({ ...before, isRead: true });
  });

  it("does not touch another user's vacancies", async () => {
    const { userId, ids } = await seedVacancies({});
    const { asOf } = await countUnread(testDb, { userId });

    expect(await markAllRead(testDb, { userId: await stranger(), asOf })).toBe(
      0,
    );
    expect((await stored(ids[0])).isRead).toBe(false);
  });

  it("does nothing for a boundary that is not a database time", async () => {
    // Межа приходить аргументом Server Action - недовірений ввід.
    const { userId, ids } = await seedVacancies({});

    for (const asOf of ["", "tomorrow", "2026-11-18", "2026-11-18T10:00:00Z"]) {
      expect(await markAllRead(testDb, { userId, asOf })).toBe(0);
    }
    expect((await stored(ids[0])).isRead).toBe(false);
  });
});

describe("countRead", () => {
  it("counts every vacancy of the Read tab, not just a loaded page", async () => {
    const { userId } = await seedVacancies(
      { isRead: true },
      { isRead: true, isFavorite: true },
      {},
      // Закрита живе лише у Favorites, у вкладці Read її немає.
      { isRead: true, closedAt: DETECTED, isFavorite: true },
    );

    expect(await countRead(testDb, { userId })).toBe(2);
  });

  it("does not count another user's vacancies", async () => {
    await seedVacancies({ isRead: true });

    expect(await countRead(testDb, { userId: await stranger() })).toBe(0);
  });
});

describe("markAllUnread", () => {
  // Задача 6.18: межі немає - у вкладку Read потрапляє лише прочитане самою
  // людиною, перевірка туди нічого не додає.
  it("returns every vacancy of the Read tab to Unread", async () => {
    const { userId, ids } = await seedVacancies(
      { isRead: true },
      { isRead: true, isFavorite: true },
      {},
    );

    expect(await markAllUnread(testDb, { userId })).toBe(2);
    expect((await stored(ids[0])).isRead).toBe(false);
    expect((await stored(ids[1])).isRead).toBe(false);
  });

  it("leaves a closed vacancy as it is", async () => {
    // Закрита - лише у Favorites; Mark all as unread діє на вкладку Read.
    const { userId, ids } = await seedVacancies({
      isRead: true,
      closedAt: DETECTED,
      isFavorite: true,
    });

    expect(await markAllUnread(testDb, { userId })).toBe(0);
    expect((await stored(ids[0])).isRead).toBe(true);
  });

  it("changes only the read mark", async () => {
    const { userId, ids } = await seedVacancies({
      isRead: true,
      isFavorite: true,
    });
    const before = await stored(ids[0]);

    await markAllUnread(testDb, { userId });

    expect(await stored(ids[0])).toEqual({ ...before, isRead: false });
  });

  it("does not touch another user's vacancies", async () => {
    const { ids } = await seedVacancies({ isRead: true });

    expect(await markAllUnread(testDb, { userId: await stranger() })).toBe(0);
    expect((await stored(ids[0])).isRead).toBe(true);
  });
});

describe("setCompanyVacanciesRead", () => {
  it("marks every active vacancy of the company and reports how many", async () => {
    const { userId, companyId, ids } = await seedVacancies(
      {},
      { isRead: true },
      {},
    );

    expect(
      await setCompanyVacanciesRead(testDb, {
        userId,
        companyId,
        isRead: true,
      }),
    ).toBe(3);
    for (const id of ids) {
      expect((await stored(id)).isRead).toBe(true);
    }

    expect(
      await setCompanyVacanciesRead(testDb, {
        userId,
        companyId,
        isRead: false,
      }),
    ).toBe(3);
    for (const id of ids) {
      expect((await stored(id)).isRead).toBe(false);
    }
  });

  it("leaves closed vacancies as they are", async () => {
    // Закрита живе лише у Favorites: «усі активні вакансії компанії» її не
    // включають (docs/ui.md, розділ 4.2).
    const { userId, companyId, ids } = await seedVacancies({
      closedAt: DETECTED,
      isFavorite: true,
    });

    expect(
      await setCompanyVacanciesRead(testDb, {
        userId,
        companyId,
        isRead: true,
      }),
    ).toBe(0);
    expect((await stored(ids[0])).isRead).toBe(false);
  });

  it("does not touch other companies", async () => {
    const first = await seedVacancies({});
    const second = await seedVacancies({});

    await setCompanyVacanciesRead(testDb, {
      userId: first.userId,
      companyId: first.companyId,
      isRead: true,
    });

    expect((await stored(second.ids[0])).isRead).toBe(false);
  });

  it("does nothing for another user's company or an id that is not an id", async () => {
    const { companyId, ids } = await seedVacancies({});
    const userId = await stranger();

    expect(
      await setCompanyVacanciesRead(testDb, {
        userId,
        companyId,
        isRead: true,
      }),
    ).toBe(0);
    expect(
      await setCompanyVacanciesRead(testDb, {
        userId,
        companyId: "not-a-uuid",
        isRead: true,
      }),
    ).toBe(0);
    expect((await stored(ids[0])).isRead).toBe(false);
  });
});
