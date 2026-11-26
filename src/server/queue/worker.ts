/**
 * The queue worker loop. The rules are in the README.md next to this file, "Worker loop".
 */
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { HttpClient } from "../http/client.ts";
import { claimTask } from "./claim.ts";
import { finalizeRuns } from "./finalize.ts";
import { recoverStaleTasks } from "./recover.ts";
import { runTask } from "./run-task.ts";

/** The pause between loop steps while the queue is empty or full. */
export const POLL_MS = 2000;

export interface QueueWorkerOptions {
  db: NodePgDatabase;
  client: HttpClient;
  /** The limit of simultaneous tasks - shared by all processes (`claim.ts`). */
  maxRunning: number;
  pollMs?: number;
}

export interface QueueWorker {
  start(): void;
  /** Stops the loop and waits until all the work started has finished. */
  stop(): Promise<void>;
}

export function createQueueWorker({
  db,
  client,
  maxRunning,
  pollMs = POLL_MS,
}: QueueWorkerOptions): QueueWorker {
  // Running tasks - counted against the `maxRunning` limit.
  const inFlight = new Set<Promise<unknown>>();
  // All the work started: steps, refills and tasks. `stop` waits for all of it -
  // otherwise a claim in progress would start a task after the stop.
  const pending = new Set<Promise<unknown>>();
  let timer: NodeJS.Timeout | undefined;
  let stopped = true;

  /** Claims tasks while there are free slots and something to take. */
  async function fill(): Promise<void> {
    while (!stopped && inFlight.size < maxRunning) {
      const claimed = await claimTask(db, { now: new Date(), maxRunning });
      if (claimed === null) return;

      const running = runTask(db, client, claimed)
        .catch((error: unknown) => {
          console.error(`Check task ${claimed.id} failed to finish`, error);
        })
        .finally(() => {
          inFlight.delete(running);
          // A freed slot is filled at once, not on the next step.
          if (!stopped) track(fill().catch(logStepError));
        });
      inFlight.add(running);
      track(running);
    }
  }

  function track(work: Promise<unknown>): void {
    pending.add(work);
    void work.finally(() => pending.delete(work));
  }

  async function step(): Promise<void> {
    const now = new Date();
    await recoverStaleTasks(db, { now });
    await finalizeRuns(db, { now });
    await fill();
  }

  function schedule(): void {
    if (stopped) return;
    timer = setTimeout(() => {
      // The next step only after this one finishes: steps never overlap. A
      // database failure does not stop the loop: the next step tries again.
      track(step().catch(logStepError).finally(schedule));
    }, pollMs);
    // The timer does not keep the process alive: the server stops without waiting for the queue.
    timer.unref();
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      schedule();
    },
    async stop() {
      stopped = true;
      clearTimeout(timer);
      // Work can spawn new work (a task spawns a refill), so we wait until
      // nothing is left.
      while (pending.size > 0) {
        await Promise.allSettled([...pending]);
      }
    },
  };
}

function logStepError(error: unknown): void {
  console.error("Check queue step failed", error);
}
