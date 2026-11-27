/**
 * When to ask the server about the check state (src/server/checks/README.md).
 * No React and no network: what exactly to ask and what to do with the answer is
 * decided by whoever creates the poller (`app/components/check-status-provider.tsx`).
 */
import type { CheckStatus } from "./check-status";

/** How often to poll while a check is running. */
export const POLL_INTERVAL_MS = 3000;

/**
 * How often to poll while there is no check: to notice an auto-check that started
 * after the page loaded. The schedule itself looks once a minute
 * (`server/checks/auto-check-scheduler.ts`), so asking more often is pointless.
 */
export const IDLE_POLL_INTERVAL_MS = 60_000;

/** How many failed polls in a row before the connection counts as lost. */
export const MAX_FAILED_POLLS = 3;

export interface StatusPollerOptions {
  fetchStatus: () => Promise<CheckStatus>;
  onStatus: (status: CheckStatus) => void;
  /** The connection is lost - called once, and polling stops. */
  onLost: () => void;
  intervalMs?: number;
  idleIntervalMs?: number;
  /**
   * Whether the tab is hidden. Outside a check a hidden tab is not polled; when it
   * is shown again, the owner calls `resume`.
   */
  isHidden?: () => boolean;
}

export interface StatusPoller {
  /** One poll now - on page load. */
  start(): void;
  /**
   * A state known without polling (the Check all response): it is shown at once,
   * and if a check is running, polling starts.
   */
  track(status: CheckStatus): void;
  /** The tab is shown again: poll now, without waiting for the timer. */
  resume(): void;
  stop(): void;
}

export function createStatusPoller({
  fetchStatus,
  onStatus,
  onLost,
  intervalMs = POLL_INTERVAL_MS,
  idleIntervalMs = IDLE_POLL_INTERVAL_MS,
  isHidden = () => false,
}: StatusPollerOptions): StatusPoller {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;
  let failures = 0;
  let stopped = false;
  // Whether a check is running, by the last known answer - the rate depends on it.
  let busy = false;

  function cancel(): void {
    clearTimeout(timer);
    timer = undefined;
  }

  function schedule(delay: number): void {
    // One scheduled or running poll at a time: a `track` in the middle of a poll
    // must not double the rate.
    if (stopped || inFlight || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      // Outside a check a hidden tab is not polled - until `resume`.
      if (!busy && isHidden()) return;
      void poll();
    }, delay);
  }

  async function poll(): Promise<void> {
    if (stopped) return;
    inFlight = true;

    try {
      const status = await fetchStatus();
      failures = 0;
      if (stopped) return;
      busy = isBusy(status);
      onStatus(status);
    } catch {
      failures += 1;
      if (failures >= MAX_FAILED_POLLS) {
        // Polling does not come back until the next page load.
        stopped = true;
        onLost();
        return;
      }
    } finally {
      inFlight = false;
    }

    // After a failure, a quick retry: otherwise a failure outside a check would
    // be noticed only after three minutes.
    schedule(busy || failures > 0 ? intervalMs : idleIntervalMs);
  }

  return {
    start() {
      void poll();
    },
    track(status) {
      if (stopped) return;
      onStatus(status);
      busy = isBusy(status);
      if (busy) {
        // The slow timer is replaced with a fast one.
        if (!inFlight) cancel();
        schedule(intervalMs);
      }
    },
    resume() {
      if (stopped || inFlight) return;
      cancel();
      void poll();
    },
    stop() {
      stopped = true;
      cancel();
    },
  };
}

/** Whether something worth watching is running: a general check or Find new pages. */
export function isBusy(status: CheckStatus): boolean {
  return status.run !== null || status.findingNewPages;
}
