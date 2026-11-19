/**
 * Старт циклу черги в процесі сервера Next - його викликає
 * `src/instrumentation.ts` один раз на старті сервера.
 */
import { getDb } from "../db/client.ts";
import { httpClient } from "../http/http-client.ts";
import { parseParallelChecks } from "./parallel-checks.ts";
import { createQueueWorker, type QueueWorker } from "./worker.ts";

// Один цикл на процес. `globalThis`, як і пул бази (`db/client.ts`): у
// dev-режимі Next перезавантажує серверні модулі, і змінна модуля обнулялася б
// разом із ним - другий цикл поверх першого.
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
