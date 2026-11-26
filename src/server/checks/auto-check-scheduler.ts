/**
 * The auto-check schedule's tick (task 6.03). The decision "is it time yet" is not
 * here - only when to ask: right at startup and then every `tickMs`.
 *
 * A short tick, not one timer for the whole interval: the time of the next check
 * is computed from the clock and the database (`auto-check-schedule.ts`), so
 * after the computer sleeps an overdue check starts on the nearest tick, not
 * after one more full interval. Whether a Node timer counts sleep time on macOS
 * was not checked - and there is no need to rely on it.
 */

/** How often to ask the schedule. A pass itself is a few light database queries. */
export const AUTO_CHECK_TICK_MS = 60_000;

export interface AutoCheckSchedulerOptions {
  /** One pass of the schedule; `isStartup` - the first one after the app starts. */
  runPass: (isStartup: boolean) => Promise<void>;
  tickMs?: number;
}

export interface AutoCheckScheduler {
  start(): void;
  /** Stops the tick and waits until the pass in progress has finished. */
  stop(): Promise<void>;
}

export function createAutoCheckScheduler({
  runPass,
  tickMs = AUTO_CHECK_TICK_MS,
}: AutoCheckSchedulerOptions): AutoCheckScheduler {
  let timer: NodeJS.Timeout | undefined;
  let stopped = true;
  let current: Promise<void> = Promise.resolve();

  function pass(isStartup: boolean): void {
    // The next tick only after this one finishes: passes never overlap. A failure
    // does not stop the schedule: the next tick tries again.
    current = runPass(isStartup)
      .catch((error: unknown) => {
        console.error("Auto check pass failed", error);
      })
      .finally(schedule);
  }

  function schedule(): void {
    if (stopped) return;
    timer = setTimeout(() => pass(false), tickMs);
    // The timer does not keep the process alive: the server stops without waiting for the schedule.
    timer.unref();
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      pass(true);
    },
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await current;
    },
  };
}
