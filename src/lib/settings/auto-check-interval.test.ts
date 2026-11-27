import { describe, expect, it } from "vitest";

import {
  AUTO_CHECK_INTERVALS,
  DEFAULT_AUTO_CHECK_INTERVAL,
  parseAutoCheckInterval,
} from "./auto-check-interval";

describe("parseAutoCheckInterval", () => {
  it("offers 3, 6, 12 and 24 hours with 6 by default", () => {
    expect(AUTO_CHECK_INTERVALS).toEqual([3, 6, 12, 24]);
    expect(DEFAULT_AUTO_CHECK_INTERVAL).toBe(6);
  });

  it("reads an interval from the list", () => {
    expect(parseAutoCheckInterval(12)).toBe(12);
    // From a form the value comes as a string.
    expect(parseAutoCheckInterval("24")).toBe(24);
  });

  it("answers null for anything off the list", () => {
    // The value arrives as a Server Action argument, so it can be anything: it must
    // not be saved, and silently replacing it with another is not allowed either.
    expect(parseAutoCheckInterval(5)).toBeNull();
    expect(parseAutoCheckInterval("6h")).toBeNull();
    expect(parseAutoCheckInterval("")).toBeNull();
    expect(parseAutoCheckInterval(null)).toBeNull();
    expect(parseAutoCheckInterval(6.5)).toBeNull();
  });
});
