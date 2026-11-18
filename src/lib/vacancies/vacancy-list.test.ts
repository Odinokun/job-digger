import { describe, expect, it } from "vitest";

import { parseJobsTab } from "./vacancy-list";

describe("parseJobsTab", () => {
  it("reads every known tab", () => {
    expect(parseJobsTab("unread")).toBe("unread");
    expect(parseJobsTab("read")).toBe("read");
    expect(parseJobsTab("favorites")).toBe("favorites");
    expect(parseJobsTab("all")).toBe("all");
  });

  it("falls back to Unread for anything else", () => {
    // Значення приходить з адреси або з аргумента Server Action: вкладка за
    // замовчуванням краща за помилку (docs/ui.md, розділ 4.1).
    expect(parseJobsTab(undefined)).toBe("unread");
    expect(parseJobsTab("Read")).toBe("unread");
    expect(parseJobsTab(["read"])).toBe("unread");
    expect(parseJobsTab(42)).toBe("unread");
  });
});
