import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { careerSources, companies, vacancies } from "./schema.ts";
import { seedSystemUser } from "./system-user.ts";
import { testDb } from "./testing/test-db.ts";
import { companySiteValues } from "./testing/company-values.ts";

// Drizzle обертає помилку драйвера у DrizzleQueryError, код - у `cause`.
const UNIQUE_VIOLATION = { cause: { code: "23505" } };

/** Компанія з одним джерелом Greenhouse - повертає id джерела. */
async function greenhouseSource(board: string): Promise<string> {
  const user = await seedSystemUser(testDb);
  const [company] = await testDb
    .insert(companies)
    .values({
      userId: user.id,
      name: board,
      ...companySiteValues(board),
    })
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

function vacancy(sourceId: string, key: string) {
  return {
    sourceId,
    key,
    title: "Account Executive",
    url: "https://job-boards.greenhouse.io/discord/jobs/8927168002",
  };
}

describe("vacancies", () => {
  it("starts unread, not favorite and open, seen when it was detected", async () => {
    const sourceId = await greenhouseSource("discord");

    const [row] = await testDb
      .insert(vacancies)
      .values(vacancy(sourceId, "id:8927168002"))
      .returning();

    expect(row).toMatchObject({
      isRead: false,
      isFavorite: false,
      closedAt: null,
      location: null,
    });
    expect(row.lastSeenAt).toEqual(row.firstDetectedAt);
  });

  it("refuses a second vacancy with the same key in one source", async () => {
    const sourceId = await greenhouseSource("discord");
    await testDb.insert(vacancies).values(vacancy(sourceId, "id:1"));

    await expect(
      testDb.insert(vacancies).values(vacancy(sourceId, "id:1")),
    ).rejects.toMatchObject(UNIQUE_VIOLATION);
  });

  it("allows the same key in different sources", async () => {
    // Між джерелами дублікати не обʼєднуємо (src/server/vacancies/README.md).
    const first = await greenhouseSource("discord");
    const second = await greenhouseSource("figma");

    await testDb.insert(vacancies).values(vacancy(first, "id:1"));
    await testDb.insert(vacancies).values(vacancy(second, "id:1"));

    expect(await testDb.select().from(vacancies)).toHaveLength(2);
  });

  it("goes away together with its source, favorites included", async () => {
    const sourceId = await greenhouseSource("discord");
    await testDb
      .insert(vacancies)
      .values({ ...vacancy(sourceId, "id:1"), isFavorite: true });

    await testDb.delete(careerSources).where(eq(careerSources.id, sourceId));

    expect(await testDb.select().from(vacancies)).toHaveLength(0);
  });
});
