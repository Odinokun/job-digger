/**
 * Ввічливість до сайтів: не більше `maxConcurrent` запитів одночасно до одного
 * хоста і щонайменше `gapMs` між стартами запитів до нього. Запити до різних
 * хостів одне одного не чекають (docs/discovery-and-parsing.md, розділ 6).
 *
 * «Сайт» - це хост. Усі компанії на одній ATS ділять її хост
 * (`boards-api.greenhouse.io`), тож до платформи йде не більше запиту на `gapMs`
 * з урахуванням паралельності - tasks/3.02-polite-http-client.md.
 */

export interface HostLimiterOptions {
  maxConcurrent: number;
  gapMs: number;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export interface HostLimiter {
  /** Виконує задачу, коли хост готовий її прийняти, і повертає її результат. */
  run<T>(host: string, task: () => Promise<T>): Promise<T>;
}

interface HostState {
  active: number;
  /** Час останнього старту; `-Infinity` - ще не було жодного. */
  lastStart: number;
  /** Ті, хто чекає вільного місця: будяться, коли якась задача завершилась. */
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
        // Поки спали, місце або паузу міг зайняти інший - перевіряємо знову.
        continue;
      }

      // Між перевіркою й захопленням немає `await`, тож двоє не займуть
      // одне місце.
      state.active += 1;
      state.lastStart = options.now();
      return;
    }
  }

  function release(state: HostState): void {
    state.active -= 1;
    // Будимо всіх: кожен сам перевірить, чи настала його черга.
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
