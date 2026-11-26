import { describe, expect, it } from "vitest";

import { parseAutoCheckEnabled } from "./auto-check-env.ts";

describe("parseAutoCheckEnabled", () => {
  it("is on unless switched off", () => {
    expect(parseAutoCheckEnabled(undefined)).toBe(true);
    expect(parseAutoCheckEnabled("")).toBe(true);
    expect(parseAutoCheckEnabled("on")).toBe(true);
  });

  it("is off with AUTO_CHECK=off", () => {
    expect(parseAutoCheckEnabled("off")).toBe(false);
    expect(parseAutoCheckEnabled(" off ")).toBe(false);
  });

  it("refuses anything else instead of guessing", () => {
    // `false`, `0`, `OFF` - the person clearly wanted to turn it off, and quietly
    // keeping the checks on would be worse than an error at startup.
    expect(() => parseAutoCheckEnabled("false")).toThrow(/AUTO_CHECK/);
    expect(() => parseAutoCheckEnabled("OFF")).toThrow(/AUTO_CHECK/);
    expect(() => parseAutoCheckEnabled("0")).toThrow(/AUTO_CHECK/);
  });
});
