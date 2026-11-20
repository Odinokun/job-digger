import { describe, expect, it } from "vitest";

import {
  AUTO_CHECK_INTERVALS,
  DEFAULT_AUTO_CHECK_INTERVAL,
  parseAutoCheckInterval,
} from "./auto-check-interval";

describe("parseAutoCheckInterval", () => {
  it("offers 3, 6, 12 and 24 hours with 6 by default", () => {
    // docs/ui.md, розділ 4.5.
    expect(AUTO_CHECK_INTERVALS).toEqual([3, 6, 12, 24]);
    expect(DEFAULT_AUTO_CHECK_INTERVAL).toBe(6);
  });

  it("reads an interval from the list", () => {
    expect(parseAutoCheckInterval(12)).toBe(12);
    // Із форми значення приходить рядком.
    expect(parseAutoCheckInterval("24")).toBe(24);
  });

  it("answers null for anything off the list", () => {
    // Значення приходить аргументом Server Action, тобто будь-яке: зберігати
    // його не можна, а мовчки підміняти іншим - теж.
    expect(parseAutoCheckInterval(5)).toBeNull();
    expect(parseAutoCheckInterval("6h")).toBeNull();
    expect(parseAutoCheckInterval("")).toBeNull();
    expect(parseAutoCheckInterval(null)).toBeNull();
    expect(parseAutoCheckInterval(6.5)).toBeNull();
  });
});
