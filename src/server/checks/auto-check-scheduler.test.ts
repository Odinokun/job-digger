import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAutoCheckScheduler } from "./auto-check-scheduler.ts";

describe("createAutoCheckScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs the startup pass right away, then the regular one every tick", async () => {
    const passes: boolean[] = [];
    const scheduler = createAutoCheckScheduler({
      tickMs: 60_000,
      runPass: async (isStartup) => {
        passes.push(isStartup);
      },
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(passes).toEqual([true]);

    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(passes).toEqual([true, false, false]);

    await scheduler.stop();
  });

  it("never overlaps passes: the next tick waits for a slow one", async () => {
    let running = 0;
    let most = 0;
    const scheduler = createAutoCheckScheduler({
      tickMs: 1_000,
      runPass: async () => {
        running += 1;
        most = Math.max(most, running);
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        running -= 1;
      },
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(20_000);
    // `stop` waits for the pass in progress, which is stuck on the fake timer.
    const stopping = scheduler.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    await stopping;

    expect(most).toBe(1);
  });

  it("keeps ticking after a failed pass", async () => {
    // The database might have been unavailable - the next tick tries again.
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let calls = 0;
    const scheduler = createAutoCheckScheduler({
      tickMs: 1_000,
      runPass: async () => {
        calls += 1;
        throw new Error("database is down");
      },
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(2_000);
    await scheduler.stop();

    expect(calls).toBe(3);
    expect(errors).toHaveBeenCalled();
  });

  it("stops ticking after stop", async () => {
    let calls = 0;
    const scheduler = createAutoCheckScheduler({
      tickMs: 1_000,
      runPass: async () => {
        calls += 1;
      },
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    await scheduler.stop();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(calls).toBe(1);
  });
});
