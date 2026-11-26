import { describe, expect, it } from "vitest";

import {
  isAutoCheckDue,
  isStartupCheckDue,
  nextAutoCheckAt,
} from "./auto-check-schedule.ts";

const lastStart = new Date("2026-11-20T09:00:00Z");

function hoursAfter(from: Date, hours: number): Date {
  return new Date(from.getTime() + hours * 3_600_000);
}

describe("nextAutoCheckAt", () => {
  it("counts the interval from the start of the last general check", () => {
    // From the start, not from the finish: otherwise a long check would shift the
    // schedule (src/server/checks/README.md).
    expect(nextAutoCheckAt(lastStart, 6)).toEqual(hoursAfter(lastStart, 6));
  });

  it("is null before the first general check: it is due right away", () => {
    expect(nextAutoCheckAt(null, 6)).toBeNull();
  });
});

describe("isAutoCheckDue", () => {
  it("is due once the interval has passed", () => {
    expect(
      isAutoCheckDue({
        lastStartedAt: lastStart,
        intervalHours: 6,
        now: hoursAfter(lastStart, 6),
      }),
    ).toBe(true);
    expect(
      isAutoCheckDue({
        lastStartedAt: lastStart,
        intervalHours: 6,
        now: hoursAfter(lastStart, 30),
      }),
    ).toBe(true);
  });

  it("is not due a moment before", () => {
    expect(
      isAutoCheckDue({
        lastStartedAt: lastStart,
        intervalHours: 6,
        now: new Date(hoursAfter(lastStart, 6).getTime() - 1),
      }),
    ).toBe(false);
  });

  it("is due when there has never been a general check", () => {
    expect(
      isAutoCheckDue({ lastStartedAt: null, intervalHours: 6, now: lastStart }),
    ).toBe(true);
  });

  it("follows a changed interval right away", () => {
    // The user shortened the interval from 24 to 3 hours 4 hours after a check:
    // there is no need to wait for the rest of the day.
    expect(
      isAutoCheckDue({
        lastStartedAt: lastStart,
        intervalHours: 3,
        now: hoursAfter(lastStart, 4),
      }),
    ).toBe(true);
  });

  it("is not due when the last start lies in the future", () => {
    // The computer clock was moved back: better to wait than to check every
    // minute until the time catches up with the record in the database.
    expect(
      isAutoCheckDue({
        lastStartedAt: lastStart,
        intervalHours: 6,
        now: hoursAfter(lastStart, -2),
      }),
    ).toBe(false);
  });
});

describe("isStartupCheckDue", () => {
  // src/server/checks/README.md: at app startup a general check runs at once if
  // the last one was more than an hour ago.
  it("is due when the last general check is more than an hour old", () => {
    expect(
      isStartupCheckDue({
        lastStartedAt: lastStart,
        now: new Date(hoursAfter(lastStart, 1).getTime() + 1),
      }),
    ).toBe(true);
  });

  it("waits when the last general check is an hour old or newer", () => {
    // Then the count simply continues by the interval.
    expect(
      isStartupCheckDue({
        lastStartedAt: lastStart,
        now: hoursAfter(lastStart, 1),
      }),
    ).toBe(false);
  });

  it("is due when there has never been a general check", () => {
    expect(isStartupCheckDue({ lastStartedAt: null, now: lastStart })).toBe(
      true,
    );
  });
});
