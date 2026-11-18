import { describe, expect, it } from "vitest";

import {
  DEFAULT_PAGES_TO_CHECK,
  MAX_PAGES_TO_CHECK,
  parsePagesToCheck,
} from "./pages-to-check.ts";

describe("parsePagesToCheck", () => {
  it("uses the default of the plan when the variable is not set", () => {
    expect(DEFAULT_PAGES_TO_CHECK).toBe(5);
    expect(parsePagesToCheck(undefined)).toBe(5);
    expect(parsePagesToCheck("")).toBe(5);
    expect(parsePagesToCheck("  ")).toBe(5);
  });

  it("reads a whole number of pages", () => {
    expect(parsePagesToCheck("1")).toBe(1);
    expect(parsePagesToCheck(" 20 ")).toBe(20);
    expect(parsePagesToCheck(String(MAX_PAGES_TO_CHECK))).toBe(
      MAX_PAGES_TO_CHECK,
    );
  });

  it("refuses a value that is not a whole number in range", () => {
    for (const wrong of [
      "0",
      "-1",
      "2.5",
      "1e2",
      "five",
      "5 pages",
      String(MAX_PAGES_TO_CHECK + 1),
    ]) {
      expect(() => parsePagesToCheck(wrong)).toThrow(/PAGES_TO_CHECK/);
    }
  });
});
