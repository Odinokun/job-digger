import { describe, expect, it } from "vitest";

import {
  DEFAULT_RETRY_ATTEMPTS,
  parseRetryAttempts,
} from "./retry-attempts.ts";

describe("parseRetryAttempts", () => {
  it("defaults to two retries", () => {
    // docs/discovery-and-parsing.md, розділ 6: «до 2 повторних спроб».
    expect(DEFAULT_RETRY_ATTEMPTS).toBe(2);
    expect(parseRetryAttempts(undefined)).toBe(2);
    expect(parseRetryAttempts("")).toBe(2);
  });

  it("reads 0, 1 or 2", () => {
    expect(parseRetryAttempts("0")).toBe(0);
    expect(parseRetryAttempts(" 1 ")).toBe(1);
    expect(parseRetryAttempts("2")).toBe(2);
  });

  it("refuses anything else instead of guessing", () => {
    // Більше двох - не дозволяє ввічливість до сайтів.
    expect(() => parseRetryAttempts("3")).toThrow(/RETRY_ATTEMPTS/);
    expect(() => parseRetryAttempts("-1")).toThrow(/RETRY_ATTEMPTS/);
    expect(() => parseRetryAttempts("1.5")).toThrow(/RETRY_ATTEMPTS/);
    expect(() => parseRetryAttempts("two")).toThrow(/RETRY_ATTEMPTS/);
  });
});
