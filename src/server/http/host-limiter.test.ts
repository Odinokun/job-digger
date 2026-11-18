import { describe, expect, it } from "vitest";

import { createHostLimiter } from "./host-limiter.ts";

/**
 * Годинник, яким керує тест: `sleep` ставить таймер, `advance` пересуває час і
 * спрацьовує таймери, що настали. Справжнього часу тести не чекають.
 */
function fakeClock() {
  let time = 0;
  const timers: Array<{ at: number; fire: () => void }> = [];

  return {
    now: () => time,
    sleep: (ms: number) =>
      new Promise<void>((fire) => timers.push({ at: time + ms, fire })),
    async advance(ms: number) {
      const end = time + ms;
      for (;;) {
        await settle();
        const next = timers
          .filter((timer) => timer.at <= end)
          .sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        time = next.at;
        timers.splice(timers.indexOf(next), 1);
        next.fire();
      }
      time = end;
      await settle();
    },
  };
}

/** Дати промісам, що вже можуть рухатися, дійти до наступного очікування. */
async function settle() {
  for (let i = 0; i < 10; i += 1) {
    await new Promise((done) => setImmediate(done));
  }
}

/** Задача, яку тест завершує сам; записує, о котрій годині вона стартувала. */
function controlledTask(starts: number[], clock: { now: () => number }) {
  let finish!: () => void;
  let failWith!: (error: Error) => void;
  const task = () => {
    starts.push(clock.now());
    return new Promise<void>((done, fail) => {
      finish = done;
      failWith = fail;
    });
  };
  return { task, finish: () => finish(), fail: (e: Error) => failWith(e) };
}

describe("createHostLimiter", () => {
  it("runs at most two tasks for one host at a time", async () => {
    const clock = fakeClock();
    const limiter = createHostLimiter({
      maxConcurrent: 2,
      gapMs: 2000,
      ...clock,
    });
    const starts: number[] = [];
    const tasks = [1, 2, 3].map(() => controlledTask(starts, clock));

    for (const { task } of tasks) {
      void limiter.run("site.test", task);
    }
    await clock.advance(10_000);

    expect(starts).toEqual([0, 2000]);

    tasks[0]?.finish();
    await clock.advance(0);

    expect(starts).toEqual([0, 2000, 10_000]);
  });

  it("keeps the starts for one host at least the gap apart", async () => {
    const clock = fakeClock();
    const limiter = createHostLimiter({
      maxConcurrent: 2,
      gapMs: 2000,
      ...clock,
    });
    const starts: number[] = [];
    const quick = async () => {
      starts.push(clock.now());
    };

    const runs = [1, 2, 3].map(() => limiter.run("site.test", quick));
    await clock.advance(10_000);
    await Promise.all(runs);

    expect(starts).toEqual([0, 2000, 4000]);
  });

  it("does not make different hosts wait for each other", async () => {
    const clock = fakeClock();
    const limiter = createHostLimiter({
      maxConcurrent: 2,
      gapMs: 2000,
      ...clock,
    });
    const starts: string[] = [];

    for (const host of ["a.test", "b.test", "c.test"]) {
      void limiter.run(host, async () => {
        starts.push(`${host}@${clock.now()}`);
      });
    }
    await clock.advance(0);

    expect(starts).toEqual(["a.test@0", "b.test@0", "c.test@0"]);
  });

  it("frees the slot when a task fails and passes the error on", async () => {
    const clock = fakeClock();
    const limiter = createHostLimiter({ maxConcurrent: 1, gapMs: 0, ...clock });
    const starts: number[] = [];
    const failing = controlledTask(starts, clock);
    const next = controlledTask(starts, clock);

    const failed = limiter.run("site.test", failing.task);
    void limiter.run("site.test", next.task);
    await clock.advance(0);
    failing.fail(new Error("boom"));

    await expect(failed).rejects.toThrow("boom");
    await clock.advance(0);
    expect(starts).toHaveLength(2);
  });
});
