import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { careerSources, companies, vacancies } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { untilSomeoneWaitsForLock } from "../db/testing/locks.ts";
import { testDb } from "../db/testing/test-db.ts";
import type { ParsedVacancy, ParseResult } from "../parsers/types.ts";
import { syncSourceVacancies } from "./lifecycle.ts";
import { companySiteValues } from "../db/testing/company-values.ts";

const FIRST_CHECK = new Date("2026-11-01T10:00:00Z");
const SECOND_CHECK = new Date("2026-11-02T10:00:00Z");
const THIRD_CHECK = new Date("2026-11-03T10:00:00Z");

/** Компанія з одним джерелом Greenhouse - повертає id джерела. */
async function greenhouseSource(board = "discord"): Promise<string> {
  const user = await seedSystemUser(testDb);
  const [company] = await testDb
    .insert(companies)
    .values({ userId: user.id, name: board, ...companySiteValues(board) })
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
  return { ok: true, vacancies: list, skipped: 0 };
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

  it("closes nothing after a truncated list, only adds and updates", async () => {
    // Список обірвано лімітом чи першою сторінкою: вакансії за ним не
    // зникли, їх просто не читали (задача 6.16).
    const sourceId = await greenhouseSource();
    await sync(
      sourceId,
      ok(parsed("101"), parsed("102"), parsed("103")),
      FIRST_CHECK,
    );
    await testDb
      .update(vacancies)
      .set({ isFavorite: true })
      .where(eq(vacancies.key, "id:103"));

    const counts = await sync(
      sourceId,
      {
        ok: true,
        vacancies: [parsed("101"), parsed("104")],
        skipped: 0,
        truncated: true,
      },
      SECOND_CHECK,
    );

    expect(counts).toEqual({ newVacancies: 1, removedVacancies: 0 });
    expect(await rowsOf(sourceId)).toEqual(
      ["id:101", "id:102", "id:103", "id:104"].map((key) =>
        expect.objectContaining({ key, closedAt: null }),
      ),
    );
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

  it("deletes a closed vacancy taken out of Favorites on the next check", async () => {
    // Remove from Favorites закриту вакансію не видаляє - лишає її для Undo
    // (задача vacancy-undo-toast). Прибирає її наступна перевірка.
    const sourceId = await greenhouseSource();
    await sync(sourceId, ok(parsed("101")), FIRST_CHECK);
    await testDb
      .update(vacancies)
      .set({ isFavorite: true })
      .where(eq(vacancies.sourceId, sourceId));
    await sync(sourceId, ok(), SECOND_CHECK);
    await testDb
      .update(vacancies)
      .set({ isFavorite: false })
      .where(eq(vacancies.sourceId, sourceId));

    await sync(sourceId, ok(), THIRD_CHECK);

    expect(await rowsOf(sourceId)).toEqual([]);
  });

  it("brings a deleted vacancy back as a new unread one", async () => {
    const sourceId = await greenhouseSource();
    await sync(sourceId, ok(parsed("101")), FIRST_CHECK);
    await testDb
      .update(vacancies)
      .set({ isRead: true })
      .where(eq(vacancies.sourceId, sourceId));
    await sync(sourceId, ok(), SECOND_CHECK);

    await sync(sourceId, ok(parsed("101")), THIRD_CHECK);

    expect(await rowsOf(sourceId)).toEqual([
      expect.objectContaining({
        key: "id:101",
        isRead: false,
        firstDetectedAt: THIRD_CHECK,
      }),
    ]);
  });

  it("replaces a vacancy without a platform ID when its url changes", async () => {
    const sourceId = await greenhouseSource();
    const oldUrl = "https://example.com/careers/designer";
    const newUrl = "https://example.com/careers/product-designer";
    await sync(
      sourceId,
      ok(parsed("", { externalId: null, url: oldUrl })),
      FIRST_CHECK,
    );
    await testDb
      .update(vacancies)
      .set({ isRead: true })
      .where(eq(vacancies.sourceId, sourceId));

    await sync(
      sourceId,
      ok(parsed("", { externalId: null, url: newUrl })),
      SECOND_CHECK,
    );

    expect(await rowsOf(sourceId)).toEqual([
      expect.objectContaining({
        key: `url:${newUrl}`,
        url: newUrl,
        isRead: false,
        firstDetectedAt: SECOND_CHECK,
      }),
    ]);
  });

  it("reopens a closed favorite that came back, keeping the user's marks", async () => {
    const sourceId = await greenhouseSource();
    await sync(sourceId, ok(parsed("101")), FIRST_CHECK);
    await testDb
      .update(vacancies)
      .set({ isRead: true, isFavorite: true })
      .where(eq(vacancies.sourceId, sourceId));
    await sync(sourceId, ok(), SECOND_CHECK);

    await sync(sourceId, ok(parsed("101")), THIRD_CHECK);

    expect(await rowsOf(sourceId)).toEqual([
      expect.objectContaining({
        key: "id:101",
        isRead: true,
        isFavorite: true,
        closedAt: null,
        firstDetectedAt: FIRST_CHECK,
        lastSeenAt: THIRD_CHECK,
      }),
    ]);
  });

  it("keeps the first of vacancies that share a key in one response", async () => {
    const sourceId = await greenhouseSource();

    await sync(
      sourceId,
      ok(
        parsed("101", { title: "Designer" }),
        parsed("101", { title: "Designer (copy)" }),
      ),
      FIRST_CHECK,
    );

    expect(await rowsOf(sourceId)).toEqual([
      expect.objectContaining({ key: "id:101", title: "Designer" }),
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

  it("keeps a vacancy favorited while the check is removing it", async () => {
    const sourceId = await greenhouseSource();
    await sync(sourceId, ok(parsed("101")), FIRST_CHECK);
    let check: Promise<unknown> | undefined;

    await testDb.transaction(async (user) => {
      await user
        .update(vacancies)
        .set({ isFavorite: true })
        .where(eq(vacancies.sourceId, sourceId));

      // Перевірка стартує, поки Favorite ще не закомічений: вона бачить
      // звичайну вакансію і впирається в блокування рядка.
      check = sync(sourceId, ok(), SECOND_CHECK);
      await untilSomeoneWaitsForLock();
    });
    await check;

    expect(await rowsOf(sourceId)).toEqual([
      expect.objectContaining({ key: "id:101", isFavorite: true }),
    ]);
  });

  it("leaves vacancies of other sources alone", async () => {
    const sourceId = await greenhouseSource("discord");
    const otherId = await greenhouseSource("linear");
    await sync(otherId, ok(parsed("101")), FIRST_CHECK);

    await sync(sourceId, ok(), SECOND_CHECK);

    expect(await rowsOf(otherId)).toHaveLength(1);
  });
});

describe("syncSourceVacancies counts", () => {
  // Нові й видалені вакансії - числа рядка History (docs/ui.md, розділ 4.4).
  it("counts every vacancy of the first check as new", async () => {
    const sourceId = await greenhouseSource();

    expect(
      await sync(sourceId, ok(parsed("101"), parsed("102")), FIRST_CHECK),
    ).toEqual({ newVacancies: 2, removedVacancies: 0 });
  });

  it("counts gone vacancies as removed, closed favorites included", async () => {
    const sourceId = await greenhouseSource();
    await sync(
      sourceId,
      ok(parsed("101"), parsed("102"), parsed("103")),
      FIRST_CHECK,
    );
    await testDb
      .update(vacancies)
      .set({ isFavorite: true })
      .where(eq(vacancies.key, "id:103"));

    expect(
      await sync(sourceId, ok(parsed("101"), parsed("104")), SECOND_CHECK),
    ).toEqual({ newVacancies: 1, removedVacancies: 2 });
  });

  it("does not count a closed favorite again on later checks", async () => {
    const sourceId = await greenhouseSource();
    await sync(sourceId, ok(parsed("101")), FIRST_CHECK);
    await testDb
      .update(vacancies)
      .set({ isFavorite: true })
      .where(eq(vacancies.sourceId, sourceId));
    await sync(sourceId, ok(), SECOND_CHECK);

    expect(await sync(sourceId, ok(), THIRD_CHECK)).toEqual({
      newVacancies: 0,
      removedVacancies: 0,
    });
  });

  it("does not count a closed vacancy taken out of Favorites as removed again", async () => {
    // Вона вже порахована, коли закрилась; видалення на наступній перевірці -
    // лише прибирання (задача vacancy-undo-toast).
    const sourceId = await greenhouseSource();
    await sync(sourceId, ok(parsed("101")), FIRST_CHECK);
    await testDb
      .update(vacancies)
      .set({ isFavorite: true })
      .where(eq(vacancies.sourceId, sourceId));
    await sync(sourceId, ok(), SECOND_CHECK);
    await testDb
      .update(vacancies)
      .set({ isFavorite: false })
      .where(eq(vacancies.sourceId, sourceId));

    expect(await sync(sourceId, ok(), THIRD_CHECK)).toEqual({
      newVacancies: 0,
      removedVacancies: 0,
    });
  });

  it("counts nothing when the check failed", async () => {
    const sourceId = await greenhouseSource();
    await sync(sourceId, ok(parsed("101")), FIRST_CHECK);

    expect(
      await sync(
        sourceId,
        { ok: false, error: { reason: "not-found" } },
        SECOND_CHECK,
      ),
    ).toEqual({ newVacancies: 0, removedVacancies: 0 });
  });
});
