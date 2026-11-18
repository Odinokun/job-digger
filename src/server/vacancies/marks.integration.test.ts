import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { careerSources, companies, users, vacancies } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { testDb } from "../db/testing/test-db.ts";
import { findVacancy, setVacancyRead } from "./marks.ts";

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
