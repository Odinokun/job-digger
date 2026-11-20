import { describe, expect, it } from "vitest";

import {
  DEFAULT_VACANCIES_TO_CHECK,
  MAX_VACANCIES_TO_CHECK,
  pagesToRead,
  parseVacanciesToCheck,
} from "./vacancies-to-check.ts";

describe("parseVacanciesToCheck", () => {
  it("uses the default when the variable is not set", () => {
    expect(DEFAULT_VACANCIES_TO_CHECK).toBe(500);
    expect(parseVacanciesToCheck(undefined)).toBe(500);
    expect(parseVacanciesToCheck("")).toBe(500);
    expect(parseVacanciesToCheck("  ")).toBe(500);
  });

  it("reads a whole number of vacancies", () => {
    expect(parseVacanciesToCheck("1")).toBe(1);
    expect(parseVacanciesToCheck(" 300 ")).toBe(300);
    expect(parseVacanciesToCheck(String(MAX_VACANCIES_TO_CHECK))).toBe(
      MAX_VACANCIES_TO_CHECK,
    );
  });

  it("refuses a value that is not a whole number in range", () => {
    for (const wrong of [
      "0",
      "-1",
      "2.5",
      "1e2",
      "five",
      "500 jobs",
      String(MAX_VACANCIES_TO_CHECK + 1),
    ]) {
      expect(() => parseVacanciesToCheck(wrong)).toThrow(/VACANCIES_TO_CHECK/);
    }
  });
});

describe("pagesToRead", () => {
  it("reads only the first page when asked for it", () => {
    expect(pagesToRead({ pageSize: 10, depth: "first-page", limit: 500 })).toBe(
      1,
    );
  });

  it("turns the vacancy limit into pages of the platform", () => {
    expect(pagesToRead({ pageSize: 10, depth: "full", limit: 500 })).toBe(50);
    expect(pagesToRead({ pageSize: 20, depth: "full", limit: 500 })).toBe(25);
    expect(pagesToRead({ pageSize: 100, depth: "full", limit: 500 })).toBe(5);
  });

  it("rounds up, so the limit is never cut short", () => {
    expect(pagesToRead({ pageSize: 100, depth: "full", limit: 250 })).toBe(3);
    expect(pagesToRead({ pageSize: 10, depth: "full", limit: 1 })).toBe(1);
  });
});
