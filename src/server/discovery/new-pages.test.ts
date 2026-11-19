import { describe, expect, it } from "vitest";

import type { Finding } from "./discover.ts";
import { decideNewPages } from "./new-pages.ts";

const SITE_BOARD: Finding = {
  url: "https://jobs.lever.co/acme",
  platform: "lever",
  via: "site",
  trial: { kind: "read", vacancies: 3 },
  ownership: null,
};

const OWN_PAGE: Finding = {
  url: "https://acme.example/careers",
  platform: "unsupported",
  via: "site",
  trial: { kind: "unsupported" },
  ownership: null,
};

const NAME_BOARD: Finding = {
  url: "https://jobs.ashbyhq.com/acme",
  platform: "ashby",
  via: "name",
  trial: { kind: "read", vacancies: 2 },
  ownership: { kind: "unknown" },
};

const SILENT_BOARD: Finding = {
  ...SITE_BOARD,
  url: "https://job-boards.greenhouse.io/acme",
  platform: "greenhouse",
  trial: { kind: "failed" },
};

const none = new Set<string>();

describe("decideNewPages", () => {
  it("adds a reliable readable finding and leaves the status alone", () => {
    expect(
      decideNewPages({
        findings: [SITE_BOARD],
        siteFailed: false,
        taken: none,
      }),
    ).toEqual({ add: [SITE_BOARD.url], status: null });
  });

  it("adds a board found by name once it links to the company site", () => {
    const confirmed: Finding = {
      ...NAME_BOARD,
      ownership: { kind: "confirmed" },
    };

    expect(
      decideNewPages({ findings: [confirmed], siteFailed: false, taken: none }),
    ).toEqual({ add: [confirmed.url], status: null });
  });

  it("keeps an own page as an untracked source next to a readable board", () => {
    // Адреса власної сторінки зберігається (docs/ui.md, розділ 4.3).
    expect(
      decideNewPages({
        findings: [SITE_BOARD, OWN_PAGE],
        siteFailed: false,
        taken: none,
      }),
    ).toEqual({ add: [SITE_BOARD.url, OWN_PAGE.url], status: null });
  });

  it("does not add a board found by name alone but says there may be a page", () => {
    expect(
      decideNewPages({
        findings: [NAME_BOARD],
        siteFailed: false,
        taken: none,
      }),
    ).toEqual({ add: [], status: "possible_page" });
  });

  it("saves an own page and calls the company unsupported", () => {
    expect(
      decideNewPages({ findings: [OWN_PAGE], siteFailed: false, taken: none }),
    ).toEqual({ add: [OWN_PAGE.url], status: "unsupported" });
  });

  it("calls a check failed when a board did not answer", () => {
    expect(
      decideNewPages({
        findings: [SILENT_BOARD, OWN_PAGE],
        siteFailed: false,
        taken: none,
      }),
    ).toEqual({ add: [OWN_PAGE.url], status: "check_failed" });
  });

  it("calls a check failed when the company site did not answer", () => {
    expect(
      decideNewPages({ findings: [], siteFailed: true, taken: none }),
    ).toEqual({ add: [], status: "check_failed" });
  });

  it("says not found when there is nothing", () => {
    expect(
      decideNewPages({ findings: [], siteFailed: false, taken: none }),
    ).toEqual({ add: [], status: "not_found" });
  });

  it("never takes a page another company already tracks", () => {
    // Save однаково відмовив би `source-taken` (задача 5.08).
    expect(
      decideNewPages({
        findings: [SITE_BOARD, NAME_BOARD],
        siteFailed: false,
        taken: new Set([SITE_BOARD.url, NAME_BOARD.url]),
      }),
    ).toEqual({ add: [], status: "not_found" });
  });
});
