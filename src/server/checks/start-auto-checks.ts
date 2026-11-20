/**
 * Старт розкладу автоперевірки в процесі сервера Next - його викликає
 * `src/instrumentation.ts` один раз на старті сервера, поруч із циклом черги.
 */
import { getDb } from "../db/client.ts";
import { parseAutoCheckEnabled } from "./auto-check-env.ts";
import {
  createAutoCheckScheduler,
  type AutoCheckScheduler,
} from "./auto-check-scheduler.ts";
import { runAutoChecks } from "./auto-check.ts";

// Один розклад на процес - той самий хід, що в `queue/start.ts`: у dev-режимі
// Next перезавантажує серверні модулі, і змінна модуля обнулялася б.
const globalForAutoChecks = globalThis as typeof globalThis & {
  jobDiggerAutoCheckScheduler?: AutoCheckScheduler;
};

export function startAutoChecks(): void {
  // Хибне значення `AUTO_CHECK` зупиняє старт сервера, а не ховається.
  if (!parseAutoCheckEnabled(process.env.AUTO_CHECK)) return;
  if (globalForAutoChecks.jobDiggerAutoCheckScheduler) return;

  const scheduler = createAutoCheckScheduler({
    runPass: (isStartup) =>
      runAutoChecks(getDb(), { now: new Date(), isStartup }),
  });
  scheduler.start();
  globalForAutoChecks.jobDiggerAutoCheckScheduler = scheduler;
}
