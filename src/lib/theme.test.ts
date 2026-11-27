import { describe, expect, it } from "vitest";

import { DEFAULT_THEME, parseThemePreference } from "./theme.ts";

describe("parseThemePreference", () => {
  it("keeps every known preference", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("system")).toBe("system");
  });

  it("falls back to the default when the value is unknown", () => {
    // The value comes from a cookie, that is from the client: it may hold anything,
    // and none of it should break the page render.
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
    // The app does not decide for the user: until they choose, the theme comes
    // from the operating system settings.
    expect(DEFAULT_THEME).toBe("system");
  });
});
