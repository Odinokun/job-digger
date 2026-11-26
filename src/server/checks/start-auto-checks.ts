/**
 * Starting the auto-check schedule in the Next server process -
 * `src/instrumentation.ts` calls it once at server startup, next to the queue loop.
 */
import { getDb } from "../db/client.ts";
import { parseAutoCheckEnabled } from "./auto-check-env.ts";
import {
  createAutoCheckScheduler,
  type AutoCheckScheduler,
} from "./auto-check-scheduler.ts";
import { runAutoChecks } from "./auto-check.ts";

// One schedule per process - the same approach as in `queue/start.ts`: in dev mode
// Next reloads server modules, and a module variable would be reset.
const globalForAutoChecks = globalThis as typeof globalThis & {
  jobDiggerAutoCheckScheduler?: AutoCheckScheduler;
};

export function startAutoChecks(): void {
  // An invalid `AUTO_CHECK` value stops the server start instead of hiding.
  if (!parseAutoCheckEnabled(process.env.AUTO_CHECK)) return;
  if (globalForAutoChecks.jobDiggerAutoCheckScheduler) return;

  const scheduler = createAutoCheckScheduler({
    runPass: (isStartup) =>
      runAutoChecks(getDb(), { now: new Date(), isStartup }),
  });
  scheduler.start();
  globalForAutoChecks.jobDiggerAutoCheckScheduler = scheduler;
}
