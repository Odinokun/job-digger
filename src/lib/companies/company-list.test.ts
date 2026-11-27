import { describe, expect, it } from "vitest";

import {
  compareCompanyRows,
  isTrackedCompany,
  matchesCompanySearch,
  notReadSourceCount,
  parseCompaniesTab,
  type CompanyListItem,
  type CompanySource,
} from "./company-list";

describe("parseCompaniesTab", () => {
  it("reads the Not tracked tab", () => {
    expect(parseCompaniesTab("not-tracked")).toBe("not-tracked");
  });

  it("reads the Needs attention tab", () => {
    expect(parseCompaniesTab("attention")).toBe("attention");
  });

  it("reads the All tab", () => {
    expect(parseCompaniesTab("all")).toBe("all");
  });

  it("falls back to Tracked for anything else", () => {
    // The value comes from the address or a Server Action argument, so it can be
    // anything: the default tab is better than an error.
    expect(parseCompaniesTab("tracked")).toBe("tracked");
    expect(parseCompaniesTab(undefined)).toBe("tracked");
    expect(parseCompaniesTab("Tracked")).toBe("tracked");
    expect(parseCompaniesTab(["not-tracked"])).toBe("tracked");
    expect(parseCompaniesTab(42)).toBe("tracked");
  });
});

describe("matchesCompanySearch", () => {
  // The same rule as in the list query (src/server/companies/list.ts): a row added
  // or changed during a search stays in the shown list only if the server would
  // find it too.
  it("matches a name that contains the query, in any case", () => {
    expect(matchesCompanySearch("Black Acorn", "aC")).toBe(true);
  });

  it("does not match a name without the query", () => {
    expect(matchesCompanySearch("Bosch", "acme")).toBe(false);
  });

  it("matches every name for an empty or blank query", () => {
    expect(matchesCompanySearch("Bosch", "")).toBe(true);
    expect(matchesCompanySearch("Bosch", "  ")).toBe(true);
  });

  it("ignores spaces around the query", () => {
    expect(matchesCompanySearch("Acme", " acme ")).toBe(true);
  });
});

describe("compareCompanyRows", () => {
  const row = (name: string, id: string): CompanyListItem => ({
    id,
    name,
    url: `https://${name.toLowerCase()}.com`,
    discoveryStatus: "not_checked",
    sources: [],
    vacancies: { total: 0, favorites: 0 },
    lastCheckedAt: null,
  });

  it("orders by name the way the database does", () => {
    const sorted = [row("Zeta", "c"), row("acme", "a"), row("Bosch", "b")].sort(
      compareCompanyRows,
    );

    expect(sorted.map((company) => company.name)).toEqual([
      "acme",
      "Bosch",
      "Zeta",
    ]);
  });

  it("falls back to the id when names match", () => {
    const sorted = [row("Acme", "b"), row("Acme", "a")].sort(
      compareCompanyRows,
    );

    expect(sorted.map((company) => company.id)).toEqual(["a", "b"]);
  });
});

describe("company sources", () => {
  const source = (overrides: Partial<CompanySource>): CompanySource => ({
    id: "s",
    url: "https://boards.greenhouse.io/acme",
    label: null,
    platform: "greenhouse",
    isTracked: true,
    isReferenceOnly: false,
    lastCheck: null,
    lastSuccessAt: null,
    isChecking: false,
    ...overrides,
  });
  const unsupported = source({
    url: "https://acme.com/careers",
    platform: "unsupported",
    isTracked: false,
  });

  // The Needs attention tab mixes both lists, so the company itself, not the tab,
  // decides the card's actions (Check now or Find pages).
  it("calls a company tracked when any of its sources is tracked", () => {
    expect(isTrackedCompany([unsupported, source({})])).toBe(true);
    expect(isTrackedCompany([unsupported])).toBe(false);
    expect(isTrackedCompany([])).toBe(false);
  });

  it("counts the pages we cannot read", () => {
    expect(notReadSourceCount([source({}), unsupported, unsupported])).toBe(2);
    expect(notReadSourceCount([source({})])).toBe(0);
  });

  it("does not count a page marked as reference only", () => {
    // Task 6.17: the person decided this page is only a link.
    const reference = { ...unsupported, isReferenceOnly: true };

    expect(notReadSourceCount([unsupported, reference])).toBe(1);
  });
});
