import { describe, expect, it } from "vitest";

import { parseCompaniesTab } from "./company-list";

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
