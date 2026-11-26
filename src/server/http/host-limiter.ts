/**
 * Politeness towards websites: at most `maxConcurrent` requests at once to one
 * host and at least `gapMs` between the starts of requests to it. Requests to
 * different hosts don't wait for each other (src/server/http/README.md).
 *
 * A "site" is a host. All companies on one ATS share its host
 * (`boards-api.greenhouse.io`), so the platform gets at most one request per
 * `gapMs`, allowing for concurrency - tasks/3.02-polite-http-client.md.
 */

export interface HostLimiterOptions {
  maxConcurrent: number;
  gapMs: number;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export interface HostLimiter {
  /** Runs the task when the host is ready to take it and returns its result. */
  run<T>(host: string, task: () => Promise<T>): Promise<T>;
}

interface HostState {
  active: number;
  /** The time of the last start; `-Infinity` means there has been none yet. */
  lastStart: number;
  /** Those waiting for a free slot: woken when some task finishes. */
  waiters: Array<() => void>;
}

export function createHostLimiter(options: HostLimiterOptions): HostLimiter {
  const hosts = new Map<string, HostState>();

  function stateOf(host: string): HostState {
    let state = hosts.get(host);
    if (!state) {
      state = { active: 0, lastStart: -Infinity, waiters: [] };
      hosts.set(host, state);
    }
    return state;
  }

  async function acquire(state: HostState): Promise<void> {
    for (;;) {
      if (state.active >= options.maxConcurrent) {
        await new Promise<void>((wake) => state.waiters.push(wake));
        continue;
      }

      const wait = state.lastStart + options.gapMs - options.now();
      if (wait > 0) {
        await options.sleep(wait);
        // While we slept, someone else may have taken the slot or the gap - check again.
        continue;
      }

      // There is no `await` between the check and the claim, so two callers
      // cannot take the same slot.
      state.active += 1;
      state.lastStart = options.now();
      return;
    }
  }

  function release(state: HostState): void {
    state.active -= 1;
    // Wake everyone: each checks for itself whether its turn has come.
    for (const wake of state.waiters.splice(0)) {
      wake();
    }
  }

  return {
    async run(host, task) {
      const state = stateOf(host);
      await acquire(state);

      try {
        return await task();
      } finally {
        release(state);
      }
    },
  };
}
