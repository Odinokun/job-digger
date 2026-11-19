import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CheckStatus } from "./check-status";
import { createStatusPoller } from "./status-poller";

const idle: CheckStatus = {
  run: null,
  summary: null,
  unread: 0,
  findingNewPages: false,
};
const running: CheckStatus = {
  run: {
    total: 3,
    checked: 1,
    failed: 0,
    newVacancies: 2,
    removedVacancies: 0,
  },
  summary: null,
  unread: 2,
  findingNewPages: false,
};
/** Find new pages іде, загальної перевірки немає. */
const finding: CheckStatus = { ...idle, findingNewPages: true };

const INTERVAL = 3000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function setup(responses: (CheckStatus | Error)[]) {
  const fetchStatus = vi.fn(async () => {
    const next = responses.shift() ?? idle;
    if (next instanceof Error) throw next;
    return next;
  });
  const onStatus = vi.fn();
  const onLost = vi.fn();
  const poller = createStatusPoller({
    fetchStatus,
    onStatus,
    onLost,
    intervalMs: INTERVAL,
  });

  return { poller, fetchStatus, onStatus, onLost };
}

describe("createStatusPoller", () => {
  it("polls once on start and stays quiet when no check is running", async () => {
    // Перевірку могли запустити розклад чи інша вкладка - одне опитування на
    // завантаженні сторінки її показує (docs/checks-and-queue.md, розділ 8).
    const { poller, fetchStatus, onStatus } = setup([idle]);

    poller.start();
    await vi.advanceTimersByTimeAsync(INTERVAL * 5);

    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith(idle);
  });

  it("keeps polling every interval while a check is running", async () => {
    const { poller, fetchStatus, onStatus } = setup([running, running, idle]);

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchStatus).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(fetchStatus).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(fetchStatus).toHaveBeenCalledTimes(3);
    expect(onStatus).toHaveBeenLastCalledWith(idle);

    // Перевірка закінчилась - опитування зупинилось.
    await vi.advanceTimersByTimeAsync(INTERVAL * 5);
    expect(fetchStatus).toHaveBeenCalledTimes(3);
  });

  it("keeps polling while Find new pages is going", async () => {
    const { poller, fetchStatus } = setup([finding, finding, idle]);

    poller.start();
    await vi.advanceTimersByTimeAsync(INTERVAL * 5);

    expect(fetchStatus).toHaveBeenCalledTimes(3);
  });

  it("starts polling from a status that came from elsewhere", async () => {
    // Check all повертає стан у відповіді - індикатор видно одразу, а
    // опитування починається без чекання.
    const { poller, fetchStatus, onStatus } = setup([idle, running, idle]);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);

    poller.track(running);
    expect(onStatus).toHaveBeenLastCalledWith(running);

    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(fetchStatus).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(fetchStatus).toHaveBeenCalledTimes(3);
  });

  it("does not poll twice as often when tracked during polling", async () => {
    const { poller, fetchStatus } = setup([running, running, running]);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);

    poller.track(running);
    await vi.advanceTimersByTimeAsync(INTERVAL);

    expect(fetchStatus).toHaveBeenCalledTimes(2);
  });

  it("gives up after three failures in a row and reports it once", async () => {
    const lost = new Error("offline");
    const { poller, fetchStatus, onLost } = setup([running, lost, lost, lost]);

    poller.start();
    await vi.advanceTimersByTimeAsync(INTERVAL * 10);

    expect(fetchStatus).toHaveBeenCalledTimes(4);
    expect(onLost).toHaveBeenCalledTimes(1);

    // До наступного завантаження сторінки - жодних опитувань.
    poller.track(running);
    await vi.advanceTimersByTimeAsync(INTERVAL * 5);
    expect(fetchStatus).toHaveBeenCalledTimes(4);
  });

  it("forgives a failure followed by a success", async () => {
    const lost = new Error("offline");
    const { poller, fetchStatus, onLost } = setup([
      running,
      lost,
      lost,
      running,
      lost,
      lost,
      idle,
    ]);

    poller.start();
    await vi.advanceTimersByTimeAsync(INTERVAL * 10);

    expect(fetchStatus).toHaveBeenCalledTimes(7);
    expect(onLost).not.toHaveBeenCalled();
  });

  it("stops polling when stopped", async () => {
    const { poller, fetchStatus } = setup([running, running]);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);

    poller.stop();
    await vi.advanceTimersByTimeAsync(INTERVAL * 5);

    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });
});
