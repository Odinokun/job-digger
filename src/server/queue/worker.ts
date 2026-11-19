/**
 * Цикл обробника черги. Правила - README.md поруч, «Цикл обробника».
 */
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { HttpClient } from "../http/client.ts";
import { claimTask } from "./claim.ts";
import { finalizeRuns } from "./finalize.ts";
import { recoverStaleTasks } from "./recover.ts";
import { runTask } from "./run-task.ts";

/** Пауза між кроками циклу, поки черга порожня або повна. */
export const POLL_MS = 2000;

export interface QueueWorkerOptions {
  db: NodePgDatabase;
  client: HttpClient;
  /** Ліміт одночасних завдань - спільний для всіх процесів (`claim.ts`). */
  maxRunning: number;
  pollMs?: number;
}

export interface QueueWorker {
  start(): void;
  /** Зупиняє цикл і чекає, поки добіжить уся розпочата робота. */
  stop(): Promise<void>;
}

export function createQueueWorker({
  db,
  client,
  maxRunning,
  pollMs = POLL_MS,
}: QueueWorkerOptions): QueueWorker {
  // Завдання, що виконуються, - під ліміт `maxRunning`.
  const inFlight = new Set<Promise<unknown>>();
  // Уся розпочата робота: кроки, дозаповнення й завдання. `stop` чекає на неї
  // всю - інакше захоплення, що саме йде, запустило б завдання вже після зупинки.
  const pending = new Set<Promise<unknown>>();
  let timer: NodeJS.Timeout | undefined;
  let stopped = true;

  /** Захоплює завдання, поки є вільні місця і є що брати. */
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
          // Звільнене місце заповнюється одразу, а не на наступному кроці.
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
      // Наступний крок - лише після завершення цього: кроки не накладаються.
      // Збій бази не зупиняє цикл: наступний крок спробує знову.
      track(step().catch(logStepError).finally(schedule));
    }, pollMs);
    // Таймер не тримає процес живим: сервер зупиняється, не чекаючи черги.
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
      // Робота може породжувати нову (завдання - дозаповнення), тож чекаємо,
      // доки не лишиться нічого.
      while (pending.size > 0) {
        await Promise.allSettled([...pending]);
      }
    },
  };
}

function logStepError(error: unknown): void {
  console.error("Check queue step failed", error);
}
