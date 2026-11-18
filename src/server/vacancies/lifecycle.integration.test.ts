import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { careerSources, companies, vacancies } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { testDb } from "../db/testing/test-db.ts";
import type { ParsedVacancy, ParseResult } from "../parsers/types.ts";
import { syncSourceVacancies } from "./lifecycle.ts";

const FIRST_CHECK = new Date("2026-11-01T10:00:00Z");

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

    await syncSourceVacancies(testDb, {
      sourceId,
      result: ok(parsed("101")),
      checkedAt: FIRST_CHECK,
    });

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
});
