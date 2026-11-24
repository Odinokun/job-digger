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
    // Значення приходить із адреси або з аргумента Server Action, тож тут буває
    // будь-що: вкладка за замовчуванням краща за помилку.
    expect(parseCompaniesTab("tracked")).toBe("tracked");
    expect(parseCompaniesTab(undefined)).toBe("tracked");
    expect(parseCompaniesTab("Tracked")).toBe("tracked");
    expect(parseCompaniesTab(["not-tracked"])).toBe("tracked");
    expect(parseCompaniesTab(42)).toBe("tracked");
  });
});

describe("matchesCompanySearch", () => {
  // Те саме правило, що в запиті списку (src/server/companies/list.ts):
  // рядок, доданий чи змінений під час пошуку, лишається в показаному списку,
  // лише якщо сервер теж його знайшов би.
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

  // На вкладці Needs attention змішані обидва списки, тож дії картки (Check
  // now чи Find pages) визначає сама компанія, а не вкладка.
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
    // Задача 6.17: людина вирішила, що ця сторінка - лише посилання.
    const reference = { ...unsupported, isReferenceOnly: true };

    expect(notReadSourceCount([unsupported, reference])).toBe(1);
  });
});
