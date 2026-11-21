import { fileURLToPath } from "node:url";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CareerPlatform } from "../../lib/companies/platform.ts";
import {
  careerSources,
  checkRuns,
  companies,
  users,
  vacancies,
} from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { testDb } from "../db/testing/test-db.ts";
import { createHttpClient, type HttpClient } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { checkCompany } from "./check-company.ts";
import { companySiteValues } from "../db/testing/company-values.ts";

/** Розклад запитів тут не перевіряється - він має власні тести. */
const noLimits: HostLimiter = { run: (_host, task) => task() };

const CHECKED_AT = new Date("2026-11-18T10:00:00Z");
/** Дошка Discord у збережених відповідях фейкового сервера - 26 вакансій. */
const DISCORD_BOARD_SIZE = 26;

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

interface SourceSeed {
  url: string;
  platform?: CareerPlatform;
  isTracked?: boolean;
  consecutiveFailures?: number;
  lastSuccessAt?: Date;
}

/** Компанія системного користувача з джерелами - повертає id компанії й джерел. */
async function companyWith(...sources: SourceSeed[]) {
  const user = await seedSystemUser(testDb);
  const [company] = await testDb
    .insert(companies)
    .values({
      userId: user.id,
      name: "Discord",
      ...companySiteValues("Discord"),
    })
    .returning();
  const rows = await testDb
    .insert(careerSources)
    .values(
      sources.map(({ url, platform = "greenhouse", ...rest }) => ({
        companyId: company.id,
        url: `https://${url}`,
        normalizedUrl: url,
        platform,
        ...rest,
      })),
    )
    .returning();

  return {
    userId: user.id,
    companyId: company.id,
    sourceIds: rows.map((row) => row.id),
  };
}

function check(userId: string, companyId: string) {
  return checkCompany(testDb, client(), {
    userId,
    companyId,
    checkedAt: CHECKED_AT,
  });
}

async function sourceRow(id: string) {
  const [row] = await testDb
    .select()
    .from(careerSources)
    .where(eq(careerSources.id, id));

  return row;
}

async function vacancyCount(sourceId: string) {
  const rows = await testDb
    .select()
    .from(vacancies)
    .where(eq(vacancies.sourceId, sourceId));

  return rows.length;
}

describe("checkCompany", () => {
  it("reads a Greenhouse source into unread vacancies and marks it checked", async () => {
    const { userId, companyId, sourceIds } = await companyWith({
      url: "job-boards.greenhouse.io/discord",
      consecutiveFailures: 2,
    });

    const result = await check(userId, companyId);

    expect(result).toEqual({ ok: true });
    expect(await vacancyCount(sourceIds[0])).toBe(DISCORD_BOARD_SIZE);
    expect(await sourceRow(sourceIds[0])).toMatchObject({
      lastCheckedAt: CHECKED_AT,
      lastSuccessAt: CHECKED_AT,
      consecutiveFailures: 0,
    });
  });

  it("counts a failed source and keeps its vacancies", async () => {
    const lastSuccess = new Date("2026-11-10T10:00:00Z");
    const { userId, companyId, sourceIds } = await companyWith({
      // Дошки немає серед збережених відповідей - фейковий сервер дає 404.
      url: "job-boards.greenhouse.io/missing",
      consecutiveFailures: 1,
      lastSuccessAt: lastSuccess,
    });
    await testDb.insert(vacancies).values({
      sourceId: sourceIds[0],
      key: "id:1",
      title: "Designer",
      url: "https://job-boards.greenhouse.io/missing/jobs/1",
    });

    const result = await check(userId, companyId);

    expect(result).toEqual({ ok: true });
    expect(await vacancyCount(sourceIds[0])).toBe(1);
    expect(await sourceRow(sourceIds[0])).toMatchObject({
      lastCheckedAt: CHECKED_AT,
      lastSuccessAt: lastSuccess,
      consecutiveFailures: 2,
    });
  });

  it("skips untracked sources and pages nothing can read", async () => {
    const { userId, companyId, sourceIds } = await companyWith(
      { url: "job-boards.greenhouse.io/discord", isTracked: false },
      { url: "acme.example/careers", platform: "unsupported" },
    );

    await check(userId, companyId);

    for (const id of sourceIds) {
      expect(await vacancyCount(id)).toBe(0);
      expect(await sourceRow(id)).toMatchObject({ lastCheckedAt: null });
    }
  });

  it("checks every tracked source of the company", async () => {
    const { userId, companyId, sourceIds } = await companyWith(
      { url: "job-boards.greenhouse.io/discord" },
      { url: "job-boards.greenhouse.io/missing" },
    );

    await check(userId, companyId);

    expect(await sourceRow(sourceIds[0])).toMatchObject({
      lastCheckedAt: CHECKED_AT,
      consecutiveFailures: 0,
    });
    expect(await sourceRow(sourceIds[1])).toMatchObject({
      lastCheckedAt: CHECKED_AT,
      consecutiveFailures: 1,
    });
  });

  it("refuses while the user's general check is running", async () => {
    // Компанія і так перевіряється в загальній перевірці - дублікатів завдань
    // не створюємо (src/server/checks/README.md).
    const { userId, companyId, sourceIds } = await companyWith({
      url: "job-boards.greenhouse.io/discord",
    });
    await testDb.insert(checkRuns).values({ userId, startedAt: CHECKED_AT });

    expect(await check(userId, companyId)).toEqual({
      ok: false,
      reason: "check-running",
    });
    expect(await vacancyCount(sourceIds[0])).toBe(0);
  });

  it("does not check a company of another user", async () => {
    const { companyId, sourceIds } = await companyWith({
      url: "job-boards.greenhouse.io/discord",
    });
    const [stranger] = await testDb
      .insert(users)
      .values({ email: "stranger@job-digger.local" })
      .returning();

    const result = await check(stranger.id, companyId);

    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(await vacancyCount(sourceIds[0])).toBe(0);
  });

  it("drops the result when the company is deleted while it is being read", async () => {
    const { userId, companyId } = await companyWith({
      url: "job-boards.greenhouse.io/discord",
    });
    const real = client();
    // Користувач видаляє компанію, поки відповідь сайту ще в дорозі.
    const deletingClient: HttpClient = {
      async get(url) {
        await testDb.delete(companies).where(eq(companies.id, companyId));
        return real.get(url);
      },
      post: (url, json) => real.post(url, json),
    };

    const result = await checkCompany(testDb, deletingClient, {
      userId,
      companyId,
      checkedAt: CHECKED_AT,
    });

    expect(result).toEqual({ ok: true });
    expect(await testDb.select().from(vacancies)).toEqual([]);
  });
});
