import { describe, expect, it } from "vitest";

import { isReliableFinding, type Finding } from "./discover.ts";

function finding(
  via: Finding["via"],
  ownership: Finding["ownership"],
): Finding {
  return {
    url: "https://jobs.ashbyhq.com/acme",
    platform: "ashby",
    via,
    vacancies: 3,
    ownership,
  };
}

describe("isReliableFinding", () => {
  it("relies on what the company site links to", () => {
    expect(isReliableFinding(finding("site", null))).toBe(true);
  });

  it("relies on a board found by name only when it links to the company site", () => {
    // Рішення автора 19.11.2026 (tasks/5.05-page-ownership-check.md).
    expect(isReliableFinding(finding("name", { kind: "confirmed" }))).toBe(
      true,
    );
    expect(isReliableFinding(finding("name", { kind: "unknown" }))).toBe(false);
    expect(
      isReliableFinding(finding("name", { kind: "other", site: "acme.org" })),
    ).toBe(false);
  });
});
