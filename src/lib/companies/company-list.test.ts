import { describe, expect, it } from "vitest";

import {
  compareCompanyRows,
  parseCompaniesTab,
  type CompanyListItem,
} from "./company-list";

describe("parseCompaniesTab", () => {
  it("reads the Not tracked tab", () => {
    expect(parseCompaniesTab("not-tracked")).toBe("not-tracked");
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

describe("compareCompanyRows", () => {
  const row = (name: string, id: string): CompanyListItem => ({
    id,
    name,
    url: `https://${name.toLowerCase()}.com`,
    discoveryStatus: "not_checked",
    sources: [],
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
