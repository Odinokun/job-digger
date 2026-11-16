import { describe, expect, it } from "vitest";

import { absoluteCompanyUrl, normalizeCompanyUrl } from "./url.ts";

describe("normalizeCompanyUrl", () => {
  it("strips the parts that never make it a different company", () => {
    expect(normalizeCompanyUrl("HTTPS://WWW.Bosch.com/")).toEqual({
      ok: true,
      url: "bosch.com",
    });
  });

  it("keeps the path as typed, because bosch.com/de and bosch.com/ua differ", () => {
    // Протоколу немає - користувач просто скопіював домен зі шляхом.
    // Регістр шляху лишається: у HTTP шлях регістрозалежний.
    expect(normalizeCompanyUrl("bosch.com/DE/")).toEqual({
      ok: true,
      url: "bosch.com/DE",
    });
  });

  it("drops the fragment but keeps the query", () => {
    // `#top` на сервер навіть не йде, а `?lang=de` інколи єдине, що
    // відрізняє національну версію сайту.
    expect(normalizeCompanyUrl("https://bosch.com/de?lang=de#top")).toEqual({
      ok: true,
      url: "bosch.com/de?lang=de",
    });
  });

  it("refuses an empty input", () => {
    expect(normalizeCompanyUrl("   ")).toEqual({ ok: false, reason: "empty" });
  });

  it("refuses something that is not an address at all", () => {
    expect(normalizeCompanyUrl("не адреса")).toEqual({
      ok: false,
      reason: "not-a-url",
    });
  });

  it("refuses a scheme we never fetch", () => {
    // Лише http і https: решту ми не завантажуємо (docs/security.md).
    expect(normalizeCompanyUrl("ftp://bosch.com")).toEqual({
      ok: false,
      reason: "unsupported-scheme",
    });
    expect(normalizeCompanyUrl("javascript:alert(1)")).toEqual({
      ok: false,
      reason: "unsupported-scheme",
    });
  });
});

describe("absoluteCompanyUrl", () => {
  it("adds https when the input has no scheme", () => {
    expect(absoluteCompanyUrl("bosch.com/de")).toBe("https://bosch.com/de");
  });

  it("leaves an address that already has a scheme alone", () => {
    // Шлях, регістр і query лишаються такими, як ввів користувач.
    expect(absoluteCompanyUrl("http://bosch.com/DE?lang=de")).toBe(
      "http://bosch.com/DE?lang=de",
    );
  });

  it("trims the input, because a pasted address often carries spaces", () => {
    expect(absoluteCompanyUrl("  bosch.com  ")).toBe("https://bosch.com");
  });
});
