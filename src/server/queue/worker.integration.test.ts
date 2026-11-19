import { fileURLToPath } from "node:url";

import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { checkRuns, checkTasks } from "../db/schema.ts";
import { testDb } from "../db/testing/test-db.ts";
import { createHttpClient } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { activeRun, greenhouseSource, task } from "./test-fixtures.ts";
import { createQueueWorker, type QueueWorker } from "./worker.ts";

/** Розклад запитів тут не перевіряється - він має власні тести. */
const noLimits: HostLimiter = { run: (_host, work) => work() };

let fakeWeb: FakeWeb;
let worker: QueueWorker | undefined;

beforeAll(async () => {
  fakeWeb = await startFakeWeb({
    root: fileURLToPath(new URL("../http/testing/responses", import.meta.url)),
    port: 0,
  });
});

afterEach(async () => {
  await worker?.stop();
  worker = undefined;
});

afterAll(async () => {
  await fakeWeb.close();
});

function startWorker(): QueueWorker {
  worker = createQueueWorker({
    db: testDb,
    client: createHttpClient({
      fakeOrigin: fakeWeb.origin,
      limiter: noLimits,
      sleep: async () => {},
      timeoutMs: 1000,
    }),
    maxRunning: 2,
    pollMs: 10,
  });
  worker.start();
  return worker;
}

describe("queue worker", () => {
  it("checks every task of a run and closes the run", async () => {
    const runId = await activeRun(testDb, { sourcesTotal: 3 });
    for (const board of ["discord", "discord", "missing"]) {
      const sourceId = await greenhouseSource(testDb, board);
      await task(testDb, { sourceId, runId });
    }

    startWorker();

    const run = await vi.waitFor(
      async () => {
        const [row] = await testDb
          .select()
          .from(checkRuns)
          .where(eq(checkRuns.id, runId));
        if (row.finishedAt === null) throw new Error("run still active");
        return row;
      },
      { timeout: 5000, interval: 20 },
    );
    expect(run).toMatchObject({ sourcesChecked: 3, sourcesFailed: 1 });
  });

  it("claims nothing after it was stopped", async () => {
    await startWorker().stop();
    const sourceId = await greenhouseSource(testDb, "discord");
    const id = await task(testDb, { sourceId });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const [row] = await testDb
      .select()
      .from(checkTasks)
      .where(eq(checkTasks.id, id));
    expect(row.status).toBe("queued");
  });
});
