import { describe, expect, it } from "vitest";

import type { CompanySource } from "./company-list";
import { cardStatusBadge, companyCheckStatus } from "./company-status";

function source(overrides: Partial<CompanySource> = {}): CompanySource {
  return {
    id: "s1",
    url: "https://job-boards.greenhouse.io/discord",
    label: null,
    platform: "greenhouse",
    isTracked: true,
    isReferenceOnly: false,
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

describe("cardStatusBadge", () => {
  it("shows the check status alone when every page is read", () => {
    expect(cardStatusBadge("ok", 0)).toEqual({
      badge: "ok",
      notReadAsText: false,
    });
    expect(cardStatusBadge("has-errors", 0)).toEqual({
      badge: "has-errors",
      notReadAsText: false,
    });
    expect(cardStatusBadge(null, 0)).toEqual({
      badge: null,
      notReadAsText: false,
    });
  });

  it("lets pages not read take the badge over a plain OK", () => {
    expect(cardStatusBadge("ok", 2)).toEqual({
      badge: "not-read",
      notReadAsText: false,
    });
    expect(cardStatusBadge(null, 1)).toEqual({
      badge: "not-read",
      notReadAsText: false,
    });
  });

  it("keeps errors and a running check in the badge and pages not read as text", () => {
    expect(cardStatusBadge("has-errors", 2)).toEqual({
      badge: "has-errors",
      notReadAsText: true,
    });
    expect(cardStatusBadge("checking", 1)).toEqual({
      badge: "checking",
      notReadAsText: true,
    });
  });
});
