import { fileURLToPath } from "node:url";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { careerSources, checkTasks, companies } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { normalizedSourceUrl } from "../db/testing/career-source-values.ts";
import { testDb } from "../db/testing/test-db.ts";
import { createHttpClient, type HttpClient } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { claimTask } from "./claim.ts";
import { runDiscoverTask } from "./discover-task.ts";
import { companyToDiscover, minutesAfter, task } from "./test-fixtures.ts";
import { companySiteValues } from "../db/testing/company-values.ts";

/** Розклад запитів тут не перевіряється - він має власні тести. */
const noLimits: HostLimiter = { run: (_host, work) => work() };

const claimedAt = new Date("2026-11-19T10:00:00Z");
const doneAt = minutesAfter(claimedAt, 1);

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

function client(): HttpClient {
  return createHttpClient({
    fakeOrigin: fakeWeb.origin,
    limiter: noLimits,
    sleep: async () => {},
    timeoutMs: 1000,
  });
}

/** Завдання пошуку для компанії, вже захоплене. */
async function claimedDiscovery(companyId: string) {
  const id = await task(testDb, { kind: "discover", companyId });
  const claimed = await claimTask(testDb, { now: claimedAt, maxRunning: 5 });
  if (claimed?.kind !== "discover") throw new Error("nothing to claim");
  return { id, claimed };
}

function run(claimed: Parameters<typeof runDiscoverTask>[2]) {
  return runDiscoverTask(testDb, client(), claimed, { clock: () => doneAt });
}

async function companyRow(id: string) {
  const [row] = await testDb
    .select()
    .from(companies)
    .where(eq(companies.id, id));
  return row;
}

async function sourcesOf(companyId: string) {
  return testDb
    .select({
      url: careerSources.url,
      platform: careerSources.platform,
      isTracked: careerSources.isTracked,
    })
    .from(careerSources)
    .where(eq(careerSources.companyId, companyId));
}

async function taskRow(id: string) {
  const [row] = await testDb
    .select()
    .from(checkTasks)
    .where(eq(checkTasks.id, id));
  return row;
}

// Сайти й дошки - src/server/http/testing/README.md.
describe("runDiscoverTask", () => {
  it("adds the board the site links to and queues its first check", async () => {
    const companyId = await companyToDiscover(testDb, "Acme");
    const { id, claimed } = await claimedDiscovery(companyId);

    expect(await run(claimed)).toBe(true);

    expect(await sourcesOf(companyId)).toEqual([
      {
        url: "https://jobs.lever.co/leverdemo",
        platform: "lever",
        isTracked: true,
      },
    ]);
    // Перша перевірка - фонова, поза History, як Retry.
    const [check] = await testDb
      .select()
      .from(checkTasks)
      .where(eq(checkTasks.kind, "check"));
    expect(check).toMatchObject({
      status: "queued",
      priority: "background",
      runId: null,
    });
    expect(await taskRow(id)).toMatchObject({
      status: "succeeded",
      finishedAt: doneAt,
    });
  });

  it("adds PeopleForce on the company's own domain as a board it reads (task 5.13)", async () => {
    const companyId = await companyToDiscover(testDb, "Vandelay");
    const { claimed } = await claimedDiscovery(companyId);

    await run(claimed);

    expect(await sourcesOf(companyId)).toEqual([
      {
        url: "https://peopleforce.vandelay.example/careers",
        platform: "peopleforce",
        isTracked: true,
      },
    ]);
  });

  it("saves an own career page and calls the company unsupported", async () => {
    const companyId = await companyToDiscover(testDb, "Initech");
    const { claimed } = await claimedDiscovery(companyId);

    await run(claimed);

    expect(await sourcesOf(companyId)).toEqual([
      {
        url: "https://initech.example/careers",
        platform: "unsupported",
        isTracked: false,
      },
    ]);
    expect(await companyRow(companyId)).toMatchObject({
      discoveryStatus: "unsupported",
    });
    expect(await testDb.select().from(checkTasks)).toHaveLength(1);
  });

  it("leaves a board found by name alone for a person to confirm", async () => {
    // Сайт `linear.example` не відповідає, а дошка `linear` за назвою веде на
    // інший сайт.
    const companyId = await companyToDiscover(testDb, "Linear");
    const { claimed } = await claimedDiscovery(companyId);

    await run(claimed);

    expect(await sourcesOf(companyId)).toEqual([]);
    expect(await companyRow(companyId)).toMatchObject({
      discoveryStatus: "possible_page",
    });
  });

  it("calls the check failed when the board did not answer", async () => {
    const companyId = await companyToDiscover(testDb, "Wayne");
    const { claimed } = await claimedDiscovery(companyId);

    await run(claimed);

    expect(await sourcesOf(companyId)).toEqual([]);
    expect(await companyRow(companyId)).toMatchObject({
      discoveryStatus: "check_failed",
    });
  });

  it("does not take a board another company already tracks", async () => {
    const user = await seedSystemUser(testDb);
    const [other] = await testDb
      .insert(companies)
      .values({
        userId: user.id,
        name: "Acme old",
        ...companySiteValues("Acme old"),
      })
      .returning();
    await testDb.insert(careerSources).values({
      companyId: other.id,
      url: "https://jobs.lever.co/leverdemo",
      normalizedUrl: normalizedSourceUrl("https://jobs.lever.co/leverdemo"),
      platform: "lever",
    });
    const companyId = await companyToDiscover(testDb, "Acme");
    const { claimed } = await claimedDiscovery(companyId);

    await run(claimed);

    expect(await sourcesOf(companyId)).toEqual([]);
    expect(await companyRow(companyId)).toMatchObject({
      discoveryStatus: "not_found",
    });
  });

  it("does not trip over a page the company already has", async () => {
    const companyId = await companyToDiscover(testDb, "Initech");
    await testDb.insert(careerSources).values({
      companyId,
      url: "https://initech.example/careers",
      normalizedUrl: normalizedSourceUrl("https://initech.example/careers"),
      platform: "unsupported",
      isTracked: false,
    });
    const { id, claimed } = await claimedDiscovery(companyId);

    await run(claimed);

    expect(await sourcesOf(companyId)).toHaveLength(1);
    expect(await companyRow(companyId)).toMatchObject({
      discoveryStatus: "unsupported",
    });
    expect(await taskRow(id)).toMatchObject({ status: "succeeded" });
  });

  it("drops the result when the company is gone", async () => {
    const companyId = await companyToDiscover(testDb, "Acme");
    const { claimed } = await claimedDiscovery(companyId);
    await testDb.delete(companies).where(eq(companies.id, companyId));

    expect(await run(claimed)).toBe(false);
  });
});
