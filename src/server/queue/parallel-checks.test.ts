import { describe, expect, it } from "vitest";

import {
  DEFAULT_PARALLEL_CHECKS,
  MAX_PARALLEL_CHECKS,
  parseParallelChecks,
} from "./parallel-checks.ts";

describe("parseParallelChecks", () => {
  it("uses the default of the plan when the variable is not set", () => {
    expect(DEFAULT_PARALLEL_CHECKS).toBe(5);
    expect(parseParallelChecks(undefined)).toBe(5);
    expect(parseParallelChecks("")).toBe(5);
    expect(parseParallelChecks("  ")).toBe(5);
  });

  it("reads a whole number within the range of the plan", () => {
    expect(MAX_PARALLEL_CHECKS).toBe(10);
    expect(parseParallelChecks("1")).toBe(1);
    expect(parseParallelChecks(" 3 ")).toBe(3);
    expect(parseParallelChecks("10")).toBe(10);
  });

  it("refuses a value that is not a whole number in range", () => {
    for (const wrong of ["0", "-1", "2.5", "1e1", "five", "11"]) {
      expect(() => parseParallelChecks(wrong)).toThrow(
        /PARALLEL_SOURCE_CHECKS/,
      );
    }
  });
});
