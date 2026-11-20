import { fileURLToPath } from "node:url";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CareerPlatform } from "../../lib/companies/platform.ts";
import { careerSources, companies, users } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { normalizedSourceUrl } from "../db/testing/career-source-values.ts";
import { testDb } from "../db/testing/test-db.ts";
import { createHttpClient } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { previewOwnPage, applyOwnPageRecipe } from "./own-page.ts";

/**
 * Рецепт власної сторінки з картки компанії (задача 6.21): кнопка Read as
 * list показує групи посилань, людина підтверджує одну.
 */

const noLimits: HostLimiter = { run: (_host, task) => task() };
const KINGGROUP = "https://kinggroup.io/vacancies/tech";
const RECIPE = "kinggroup.io/vacancies/design/";

let fakeWeb: FakeWeb;

beforeAll(async () => {
  fakeWeb = await startFakeWeb({
    root: fileURLToPath(new URL("../http/testing/responses", import.meta.url)),
    port: 0,
  });
});

afterAll(async () => {
  await fakeWeb.close();
});

function client() {
  return createHttpClient({
    fakeOrigin: fakeWeb.origin,
    limiter: noLimits,
    sleep: async () => {},
    timeoutMs: 1000,
  });
}

async function ownPageSource(
  userId: string,
  platform: CareerPlatform = "unsupported",
  url = KINGGROUP,
) {
  const [company] = await testDb
    .insert(companies)
    .values({ userId, name: "Kinggroup", url: null, normalizedUrl: null })
    .returning();
  const [source] = await testDb
    .insert(careerSources)
    .values({
      companyId: company.id,
      url,
      normalizedUrl: normalizedSourceUrl(url),
      platform,
      isTracked: platform !== "unsupported",
      isReferenceOnly: platform === "unsupported",
    })
    .returning();

  return source;
}

async function stranger() {
  const [user] = await testDb
    .insert(users)
    .values({ email: "stranger@job-digger.local" })
    .returning();

  return user.id;
}

async function stored(sourceId: string) {
  const [row] = await testDb
    .select()
    .from(careerSources)
    .where(eq(careerSources.id, sourceId));

  return row;
}

describe("previewOwnPage", () => {
  it("offers the link groups of the page, the likely one first", async () => {
    const user = await seedSystemUser(testDb);
    const source = await ownPageSource(user.id);

    const preview = await previewOwnPage(testDb, client(), {
      userId: user.id,
      sourceId: source.id,
    });

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.groups[0].prefix).toBe(RECIPE);
    expect(preview.groups[0].vacancies).toHaveLength(10);
  });

  it("says when the page has no links to offer", async () => {
    const user = await seedSystemUser(testDb);
    // Сторінка дошки Ashby: список малює JavaScript, посилань свого сайту немає.
    const source = await ownPageSource(
      user.id,
      "unsupported",
      "https://jobs.ashbyhq.com/linear",
    );

    expect(
      await previewOwnPage(testDb, client(), {
        userId: user.id,
        sourceId: source.id,
      }),
    ).toEqual({ ok: true, groups: [] });
  });

  it("reports a page that cannot be loaded", async () => {
    const user = await seedSystemUser(testDb);
    const source = await ownPageSource(
      user.id,
      "unsupported",
      "https://kinggroup.io/vacancies/gone",
    );

    expect(
      await previewOwnPage(testDb, client(), {
        userId: user.id,
        sourceId: source.id,
      }),
    ).toEqual({ ok: false, problem: "page-unavailable" });
  });

  it("does not load a page of another user or a parsed platform", async () => {
    const user = await seedSystemUser(testDb);
    const theirs = await ownPageSource(user.id);
    const parsed = await ownPageSource(user.id, "peopleforce");

    for (const [userId, sourceId] of [
      [await stranger(), theirs.id],
      [user.id, parsed.id],
      [user.id, "not-a-uuid"],
    ]) {
      expect(
        await previewOwnPage(testDb, client(), { userId, sourceId }),
      ).toEqual({ ok: false, problem: "not-found" });
    }
  });
});

describe("applyOwnPageRecipe", () => {
  it("turns an unsupported page into a tracked own page", async () => {
    const user = await seedSystemUser(testDb);
    const source = await ownPageSource(user.id);

    expect(
      await applyOwnPageRecipe(testDb, {
        userId: user.id,
        sourceId: source.id,
        prefix: RECIPE,
      }),
    ).toEqual({ ok: true });
    expect(await stored(source.id)).toMatchObject({
      platform: "own_page",
      vacancyLinkPrefix: RECIPE,
      isTracked: true,
      // «Link only» для сторінки, яку тепер читаємо, втрачає сенс (6.17).
      isReferenceOnly: false,
    });
  });

  it("replaces the recipe of an own page", async () => {
    const user = await seedSystemUser(testDb);
    const source = await ownPageSource(user.id, "own_page");

    await applyOwnPageRecipe(testDb, {
      userId: user.id,
      sourceId: source.id,
      prefix: "kinggroup.io/vacancies/tech/",
    });

    expect((await stored(source.id)).vacancyLinkPrefix).toBe(
      "kinggroup.io/vacancies/tech/",
    );
  });

  it("refuses a recipe that is not a host and a path", async () => {
    // Префікс приходить із клієнта.
    const user = await seedSystemUser(testDb);
    const source = await ownPageSource(user.id);

    for (const prefix of [
      "",
      "kinggroup.io",
      "https://kinggroup.io/x/",
      "/x/",
      "a b/",
    ]) {
      expect(
        await applyOwnPageRecipe(testDb, {
          userId: user.id,
          sourceId: source.id,
          prefix,
        }),
      ).toEqual({ ok: false });
    }
    expect((await stored(source.id)).platform).toBe("unsupported");
  });

  it("does not touch a source of another user or a parsed platform", async () => {
    const user = await seedSystemUser(testDb);
    const theirs = await ownPageSource(user.id);
    const parsed = await ownPageSource(user.id, "peopleforce");

    expect(
      await applyOwnPageRecipe(testDb, {
        userId: await stranger(),
        sourceId: theirs.id,
        prefix: RECIPE,
      }),
    ).toEqual({ ok: false });
    expect(
      await applyOwnPageRecipe(testDb, {
        userId: user.id,
        sourceId: parsed.id,
        prefix: RECIPE,
      }),
    ).toEqual({ ok: false });
    expect((await stored(parsed.id)).platform).toBe("peopleforce");
  });
});
