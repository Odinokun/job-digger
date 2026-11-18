import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { careerSources, companies, vacancies } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { testDb } from "../db/testing/test-db.ts";
import type { ParsedVacancy, ParseResult } from "../parsers/types.ts";
import { syncSourceVacancies } from "./lifecycle.ts";

const FIRST_CHECK = new Date("2026-11-01T10:00:00Z");
const SECOND_CHECK = new Date("2026-11-02T10:00:00Z");
const THIRD_CHECK = new Date("2026-11-03T10:00:00Z");

/** Компанія з одним джерелом Greenhouse - повертає id джерела. */
async function greenhouseSource(board = "discord"): Promise<string> {
  const user = await seedSystemUser(testDb);
  const [company] = await testDb
    .insert(companies)
    .values({ userId: user.id, name: board, url: null, normalizedUrl: null })
    .returning();
  const [source] = await testDb
    .insert(careerSources)
    .values({
      companyId: company.id,
      url: `https://job-boards.greenhouse.io/${board}`,
      normalizedUrl: `job-boards.greenhouse.io/${board}`,
      platform: "greenhouse",
    })
    .returning();

  return source.id;
}

function parsed(
  externalId: string,
  overrides: Partial<ParsedVacancy> = {},
): ParsedVacancy {
  return {
    externalId,
    title: "Account Executive",
    url: `https://job-boards.greenhouse.io/discord/jobs/${externalId}`,
    location: "Remote",
    ...overrides,
  };
}

function ok(...list: ParsedVacancy[]): ParseResult {
  return { ok: true, vacancies: list };
}

function sync(sourceId: string, result: ParseResult, checkedAt: Date) {
  return syncSourceVacancies(testDb, { sourceId, result, checkedAt });
}

async function rowsOf(sourceId: string) {
  return testDb
    .select()
    .from(vacancies)
    .where(eq(vacancies.sourceId, sourceId))
    .orderBy(vacancies.key);
}

describe("syncSourceVacancies", () => {
  it("creates a vacancy seen for the first time as unread", async () => {
    const sourceId = await greenhouseSource();

    await sync(sourceId, ok(parsed("101")), FIRST_CHECK);

    expect(await rowsOf(sourceId)).toEqual([
      expect.objectContaining({
        key: "id:101",
        title: "Account Executive",
        url: "https://job-boards.greenhouse.io/discord/jobs/101",
        location: "Remote",
        isRead: false,
        isFavorite: false,
        closedAt: null,
        firstDetectedAt: FIRST_CHECK,
        lastSeenAt: FIRST_CHECK,
      }),
    ]);
  });

  it("keeps read and favorite when the vacancy is found again", async () => {
    const sourceId = await greenhouseSource();
    await sync(sourceId, ok(parsed("101")), FIRST_CHECK);
    await testDb
      .update(vacancies)
      .set({ isRead: true, isFavorite: true })
      .where(eq(vacancies.sourceId, sourceId));

    await sync(sourceId, ok(parsed("101")), SECOND_CHECK);

    expect(await rowsOf(sourceId)).toEqual([
      expect.objectContaining({
        key: "id:101",
        isRead: true,
        isFavorite: true,
        firstDetectedAt: FIRST_CHECK,
        lastSeenAt: SECOND_CHECK,
      }),
    ]);
  });

  it("updates title, url and location of a vacancy with a platform ID", async () => {
    const sourceId = await greenhouseSource();
    await sync(sourceId, ok(parsed("101")), FIRST_CHECK);
    await testDb
      .update(vacancies)
      .set({ isRead: true, isFavorite: true })
      .where(eq(vacancies.sourceId, sourceId));
    const [before] = await rowsOf(sourceId);

    await sync(
      sourceId,
      ok(
        parsed("101", {
          title: "Senior Account Executive",
          url: "https://job-boards.greenhouse.io/discord/jobs/101?gh_src=new",
          location: null,
        }),
      ),
      SECOND_CHECK,
    );

    expect(await rowsOf(sourceId)).toEqual([
      expect.objectContaining({
        id: before.id,
        key: "id:101",
        title: "Senior Account Executive",
        url: "https://job-boards.greenhouse.io/discord/jobs/101?gh_src=new",
        location: null,
        isRead: true,
        isFavorite: true,
        firstDetectedAt: FIRST_CHECK,
      }),
    ]);
  });

  it("deletes a vacancy that disappeared after a successful check", async () => {
    const sourceId = await greenhouseSource();
    await sync(sourceId, ok(parsed("101"), parsed("102")), FIRST_CHECK);

    await sync(sourceId, ok(parsed("102")), SECOND_CHECK);

    expect(await rowsOf(sourceId)).toEqual([
      expect.objectContaining({ key: "id:102" }),
    ]);
  });

  it("deletes every vacancy when a successful check finds none", async () => {
    const sourceId = await greenhouseSource();
    await sync(sourceId, ok(parsed("101")), FIRST_CHECK);

    await sync(sourceId, ok(), SECOND_CHECK);

    expect(await rowsOf(sourceId)).toEqual([]);
  });

  it("marks a disappeared favorite as closed instead of deleting it", async () => {
    const sourceId = await greenhouseSource();
    await sync(sourceId, ok(parsed("101")), FIRST_CHECK);
    await testDb
      .update(vacancies)
      .set({ isRead: true, isFavorite: true })
      .where(eq(vacancies.sourceId, sourceId));

    await sync(sourceId, ok(), SECOND_CHECK);

    expect(await rowsOf(sourceId)).toEqual([
      expect.objectContaining({
        key: "id:101",
        isRead: true,
        isFavorite: true,
        closedAt: SECOND_CHECK,
        lastSeenAt: FIRST_CHECK,
      }),
    ]);
  });

  it("keeps the moment a favorite closed on later checks", async () => {
    const sourceId = await greenhouseSource();
    await sync(sourceId, ok(parsed("101")), FIRST_CHECK);
    await testDb
      .update(vacancies)
      .set({ isFavorite: true })
      .where(eq(vacancies.sourceId, sourceId));
    await sync(sourceId, ok(), SECOND_CHECK);

    await sync(sourceId, ok(), THIRD_CHECK);

    expect(await rowsOf(sourceId)).toEqual([
      expect.objectContaining({ closedAt: SECOND_CHECK }),
    ]);
  });

  it("changes nothing when the check failed", async () => {
    const sourceId = await greenhouseSource();
    await sync(sourceId, ok(parsed("101")), FIRST_CHECK);
    const before = await rowsOf(sourceId);

    await sync(
      sourceId,
      { ok: false, error: { reason: "bad-status", status: 503 } },
      SECOND_CHECK,
    );

    expect(await rowsOf(sourceId)).toEqual(before);
  });

  it("leaves vacancies of other sources alone", async () => {
    const sourceId = await greenhouseSource("discord");
    const otherId = await greenhouseSource("linear");
    await sync(otherId, ok(parsed("101")), FIRST_CHECK);

    await sync(sourceId, ok(), SECOND_CHECK);

    expect(await rowsOf(otherId)).toHaveLength(1);
  });
});
