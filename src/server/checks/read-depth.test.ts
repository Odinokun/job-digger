import { describe, expect, it } from "vitest";

import { FULL_READ_EVERY_MS, taskReadDepth } from "./read-depth.ts";

const NOW = new Date("2026-11-20T12:00:00Z");
const HOUR = 60 * 60 * 1000;

describe("taskReadDepth", () => {
  it("reads only the first page in a manual Check all", () => {
    expect(
      taskReadDepth({ mode: "first-page", lastFullReadAt: null, now: NOW }),
    ).toBe("first-page");
  });

  it("reads in full in an auto check when the source was never read in full", () => {
    expect(
      taskReadDepth({ mode: "auto", lastFullReadAt: null, now: NOW }),
    ).toBe("full");
  });

  it("reads only the first page in an auto check within a day of the last full read", () => {
    expect(
      taskReadDepth({
        mode: "auto",
        lastFullReadAt: new Date(NOW.getTime() - 23 * HOUR),
        now: NOW,
      }),
    ).toBe("first-page");
  });

  it("reads in full in an auto check once a day has passed", () => {
    expect(FULL_READ_EVERY_MS).toBe(24 * HOUR);
    expect(
      taskReadDepth({
        mode: "auto",
        lastFullReadAt: new Date(NOW.getTime() - 24 * HOUR),
        now: NOW,
      }),
    ).toBe("full");
  });
});
