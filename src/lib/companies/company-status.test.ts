import { describe, expect, it } from "vitest";

import type { CompanySource } from "./company-list";
import { companyCheckStatus } from "./company-status";

function source(overrides: Partial<CompanySource> = {}): CompanySource {
  return {
    id: "s1",
    url: "https://job-boards.greenhouse.io/discord",
    label: null,
    platform: "greenhouse",
    isTracked: true,
    lastCheck: "ok",
    lastSuccessAt: new Date("2026-11-19T10:00:00Z"),
    isChecking: false,
    ...overrides,
  };
}

const idle = { isGeneralCheckRunning: false };

describe("companyCheckStatus", () => {
  it("is OK when every checked source succeeded last time", () => {
    expect(
      companyCheckStatus([source(), source({ lastCheck: null })], idle),
    ).toBe("ok");
  });

  it("has errors when any tracked source failed last time", () => {
    expect(
      companyCheckStatus([source(), source({ lastCheck: "failed" })], idle),
    ).toBe("has-errors");
  });

  it("is checking while any tracked source is in the queue", () => {
    expect(
      companyCheckStatus(
        [source({ lastCheck: "failed" }), source({ isChecking: true })],
        idle,
      ),
    ).toBe("checking");
  });

  it("is checking for the whole general check", () => {
    // Check all бере всі компанії Tracked.
    expect(
      companyCheckStatus([source()], { isGeneralCheckRunning: true }),
    ).toBe("checking");
  });

  it("has no status before the first check", () => {
    expect(companyCheckStatus([source({ lastCheck: null })], idle)).toBeNull();
  });

  it("ignores untracked sources", () => {
    // Сторінка без відстеження не перевіряється - її збій давно не новина.
    expect(
      companyCheckStatus(
        [source(), source({ isTracked: false, lastCheck: "failed" })],
        idle,
      ),
    ).toBe("ok");
    expect(
      companyCheckStatus([source({ isTracked: false })], {
        isGeneralCheckRunning: true,
      }),
    ).toBeNull();
  });
});
