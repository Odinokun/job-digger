import { fileURLToPath } from "node:url";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  careerSources,
  checkRuns,
  checkTasks,
  vacancies,
} from "../db/schema.ts";
import { testDb } from "../db/testing/test-db.ts";
import { createHttpClient, type HttpClient } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { claimTask } from "./claim.ts";
import { runTask } from "./run-task.ts";
import {
  activeRun,
  companyToDiscover,
  greenhouseSource,
  minutesAfter,
  task,
} from "./test-fixtures.ts";

/** Request scheduling is not checked here - it has its own tests. */
const noLimits: HostLimiter = { run: (_host, work) => work() };

const claimedAt = new Date("2026-11-19T10:00:00Z");
const doneAt = minutesAfter(claimedAt, 1);
/** The Discord board in the fake server's saved responses - 26 vacancies. */
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

function client(): HttpClient {
  return createHttpClient({
    fakeOrigin: fakeWeb.origin,
    limiter: noLimits,
    sleep: async () => {},
    timeoutMs: 1000,
  });
}

/** A source task in a new run, already claimed. */
async function claimedTaskOf(sourceId: string) {
  const runId = await activeRun(testDb, { sourcesTotal: 1 });
  await task(testDb, { sourceId, runId });
  const claimed = await claimTask(testDb, { now: claimedAt, maxRunning: 5 });
  if (claimed === null) throw new Error("nothing to claim");
  return { runId, claimed };
}

function run(claimed: Parameters<typeof runTask>[2], http = client()) {
  return runTask(testDb, http, claimed, { clock: () => doneAt });
}

async function taskRow(id: string) {
  const [row] = await testDb
    .select()
    .from(checkTasks)
    .where(eq(checkTasks.id, id));
  return row;
}

async function runRow(id: string) {
  const [row] = await testDb
    .select()
    .from(checkRuns)
    .where(eq(checkRuns.id, id));
  return row;
}

async function sourceRow(id: string) {
  const [row] = await testDb
    .select()
    .from(careerSources)
    .where(eq(careerSources.id, id));
  return row;
}

/**
 * The PeopleForce Webellian source: the saved page has `rel="next"`, so the list
 * did not end with the first page.
 */
async function webellianSource() {
  const greenhouse = await greenhouseSource(testDb, "discord");
  const [{ companyId }] = await testDb
    .select({ companyId: careerSources.companyId })
    .from(careerSources)
    .where(eq(careerSources.id, greenhouse));
  const [source] = await testDb
    .insert(careerSources)
    .values({
      companyId,
      url: "https://webellian.peopleforce.io/careers",
      normalizedUrl: "webellian.peopleforce.io/careers",
      platform: "peopleforce",
    })
    .returning();
  return source;
}

describe("runTask", () => {
  it("checks the source and records the result in the task and the run", async () => {
    const sourceId = await greenhouseSource(testDb, "discord");
    const { runId, claimed } = await claimedTaskOf(sourceId);

    expect(await run(claimed)).toBe(true);

    expect(await taskRow(claimed.id)).toMatchObject({
      status: "succeeded",
      finishedAt: doneAt,
    });
    expect(await runRow(runId)).toMatchObject({
      sourcesChecked: 1,
      sourcesFailed: 0,
      newVacancies: DISCORD_BOARD_SIZE,
    });
    // The check moment is the claim moment: the discovery date of the vacancies
    // and the source state are counted from it.
    expect(await sourceRow(sourceId)).toMatchObject({
      lastCheckedAt: claimedAt,
      lastSuccessAt: claimedAt,
    });
    const [vacancy] = await testDb
      .select()
      .from(vacancies)
      .where(eq(vacancies.sourceId, sourceId))
      .limit(1);
    expect(vacancy.firstDetectedAt).toEqual(claimedAt);
  });

  it("remembers a full read of the source", async () => {
    const sourceId = await greenhouseSource(testDb, "discord");
    const { claimed } = await claimedTaskOf(sourceId);

    await run(claimed);

    expect(await sourceRow(sourceId)).toMatchObject({
      lastFullReadAt: claimedAt,
    });
  });

  it("counts a first-page read of a list that ended by itself as a full read", async () => {
    // Greenhouse returns everything in one request: the first page is the whole list.
    const sourceId = await greenhouseSource(testDb, "discord");
    const runId = await activeRun(testDb, { sourcesTotal: 1 });
    await task(testDb, { sourceId, runId, readDepth: "first-page" });
    const claimed = await claimTask(testDb, { now: claimedAt, maxRunning: 5 });
    if (claimed === null) throw new Error("nothing to claim");

    await run(claimed);

    expect(await sourceRow(sourceId)).toMatchObject({
      lastFullReadAt: claimedAt,
    });
  });

  it("reads only the first page for a first-page task and closes nothing", async () => {
    // Task 6.16: PeopleForce has 10 per page, and Webellian has more pages.
    const source = await webellianSource();
    const earlier = minutesAfter(claimedAt, -60);
    await testDb.insert(vacancies).values({
      sourceId: source.id,
      key: "id:beyond-the-first-page",
      title: "Seen on a later page",
      url: "https://webellian.peopleforce.io/careers/v/1",
      firstDetectedAt: earlier,
      lastSeenAt: earlier,
    });
    const runId = await activeRun(testDb, { sourcesTotal: 1 });
    await task(testDb, { sourceId: source.id, runId, readDepth: "first-page" });
    const claimed = await claimTask(testDb, { now: claimedAt, maxRunning: 5 });
    if (claimed === null) throw new Error("nothing to claim");

    await run(claimed);

    const rows = await testDb
      .select()
      .from(vacancies)
      .where(eq(vacancies.sourceId, source.id));
    // One page - 10 vacancies, and the one that was there before the check stayed.
    expect(rows).toHaveLength(11);
    expect(await sourceRow(source.id)).toMatchObject({
      lastSuccessAt: claimedAt,
      lastFullReadAt: null,
    });
  });

  it("counts a full task as a full read even when the list hit the limit", async () => {
    // The counterpart of the previous test: the same source, but a `full` task.
    // The fake server returns the same page with `rel="next"` for every
    // `?page=N`, so the read runs into the limit.
    const source = await webellianSource();
    const runId = await activeRun(testDb, { sourcesTotal: 1 });
    await task(testDb, { sourceId: source.id, runId, readDepth: "full" });
    const claimed = await claimTask(testDb, { now: claimedAt, maxRunning: 5 });
    if (claimed === null) throw new Error("nothing to claim");

    await run(claimed);

    expect(await sourceRow(source.id)).toMatchObject({
      lastFullReadAt: claimedAt,
    });
  });

  it("records a failed source as a failed task", async () => {
    // The board is not among the saved responses - the fake server gives 404.
    const sourceId = await greenhouseSource(testDb, "missing");
    const { runId, claimed } = await claimedTaskOf(sourceId);

    await run(claimed);

    expect(await taskRow(claimed.id)).toMatchObject({
      status: "failed",
      error: { reason: "not-found" },
    });
    expect(await runRow(runId)).toMatchObject({
      sourcesChecked: 1,
      sourcesFailed: 1,
    });
    expect(await sourceRow(sourceId)).toMatchObject({ consecutiveFailures: 1 });
  });

  it("finishes a source nothing can read yet without checking it", async () => {
    const sourceId = await greenhouseSource(testDb, "discord");
    await testDb
      .update(careerSources)
      .set({ platform: "schema_org" })
      .where(eq(careerSources.id, sourceId));
    const { runId, claimed } = await claimedTaskOf(sourceId);

    await run(claimed);

    expect(await taskRow(claimed.id)).toMatchObject({ status: "succeeded" });
    expect(await runRow(runId)).toMatchObject({
      sourcesChecked: 1,
      sourcesFailed: 0,
    });
    expect(await sourceRow(sourceId)).toMatchObject({ lastCheckedAt: null });
  });

  it("fails the task instead of the worker when the check throws", async () => {
    // A bug in our code must not crash the worker and wait 30 minutes of
    // stuck-task returns.
    const sourceId = await greenhouseSource(testDb, "discord");
    const { claimed } = await claimedTaskOf(sourceId);
    const broken: HttpClient = {
      get: () => Promise.reject(new Error("boom")),
      post: () => Promise.reject(new Error("boom")),
    };

    await run(claimed, broken);

    expect(await taskRow(claimed.id)).toMatchObject({
      status: "failed",
      error: { reason: "crashed" },
    });
  });

  it("drops the task when its source was deleted after the claim", async () => {
    const sourceId = await greenhouseSource(testDb, "discord");
    const { runId, claimed } = await claimedTaskOf(sourceId);
    await testDb.delete(careerSources).where(eq(careerSources.id, sourceId));

    expect(await run(claimed)).toBe(false);
    expect(await runRow(runId)).toMatchObject({ sourcesChecked: 0 });
  });

  it("hands a discover task to the page search", async () => {
    const companyId = await companyToDiscover(testDb, "Acme");
    const id = await task(testDb, { kind: "discover", companyId });
    const claimed = await claimTask(testDb, { now: claimedAt, maxRunning: 5 });
    if (claimed === null) throw new Error("nothing to claim");

    expect(await run(claimed)).toBe(true);
    expect(await taskRow(id)).toMatchObject({ status: "succeeded" });
    expect(
      await testDb
        .select()
        .from(careerSources)
        .where(eq(careerSources.companyId, companyId)),
    ).toHaveLength(1);
  });
});
