/**
 * Starting the queue loop in the Next server process - `src/instrumentation.ts`
 * calls it once at server startup.
 */
import { getDb } from "../db/client.ts";
import { httpClient } from "../http/http-client.ts";
import { parseParallelChecks } from "./parallel-checks.ts";
import { createQueueWorker, type QueueWorker } from "./worker.ts";

// One loop per process. `globalThis`, like the database pool (`db/client.ts`):
// in dev mode Next reloads server modules, and a module variable would be reset
// with them - a second loop on top of the first.
const globalForQueue = globalThis as typeof globalThis & {
  jobDiggerQueueWorker?: QueueWorker;
};

export function startQueueWorker(): void {
  if (globalForQueue.jobDiggerQueueWorker) return;

  const worker = createQueueWorker({
    db: getDb(),
    client: httpClient,
    maxRunning: parseParallelChecks(process.env.PARALLEL_SOURCE_CHECKS),
  });
  worker.start();
  globalForQueue.jobDiggerQueueWorker = worker;
}
