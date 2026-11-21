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
    // Від старту, а не від завершення: інакше довга перевірка зсувала б
    // розклад (src/server/checks/README.md).
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
    // Користувач скоротив інтервал із 24 до 3 годин через 4 години після
    // перевірки: чекати решту доби не треба.
    expect(
      isAutoCheckDue({
        lastStartedAt: lastStart,
        intervalHours: 3,
        now: hoursAfter(lastStart, 4),
      }),
    ).toBe(true);
  });

  it("is not due when the last start lies in the future", () => {
    // Годинник компʼютера перевели назад: краще почекати, ніж перевіряти
    // щохвилини, доки час не дожене запис у базі.
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
  // src/server/checks/README.md: на старті застосунку
  // загальна перевірка йде одразу, якщо остання була понад годину тому.
  it("is due when the last general check is more than an hour old", () => {
    expect(
      isStartupCheckDue({
        lastStartedAt: lastStart,
        now: new Date(hoursAfter(lastStart, 1).getTime() + 1),
      }),
    ).toBe(true);
  });

  it("waits when the last general check is an hour old or newer", () => {
    // Тоді відлік просто продовжується за інтервалом.
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
