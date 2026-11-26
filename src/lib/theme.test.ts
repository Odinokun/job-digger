import { describe, expect, it } from "vitest";

import { DEFAULT_THEME, parseThemePreference } from "./theme.ts";

describe("parseThemePreference", () => {
  it("keeps every known preference", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("system")).toBe("system");
  });

  it("falls back to the default when the value is unknown", () => {
    // Значення приходить із cookie, тобто від клієнта: там може лежати будь-що,
    // і жодне з цього не має ламати рендер сторінки.
    for (const value of [
      "Dark",
      "",
      "  light  ",
      "auto",
      42,
      null,
      undefined,
    ]) {
      expect(parseThemePreference(value)).toBe(DEFAULT_THEME);
    }
  });

  it("defaults to the system preference", () => {
    // Застосунок не вирішує за користувача: доки він не вибрав, тема береться
    // з налаштувань операційної системи.
    expect(DEFAULT_THEME).toBe("system");
  });
});
