import { describe, expect, it } from "vitest";

import { nameSlugs } from "./by-name.ts";

describe("nameSlugs", () => {
  it("takes the board name from the company name and site", () => {
    expect(
      nameSlugs({ name: "Linear", siteUrl: "https://linear.app" }),
    ).toEqual(["linear"]);
  });

  it("joins a name of several words with and without hyphens", () => {
    expect(
      nameSlugs({ name: "Bosch UA", siteUrl: "https://www.bosch.de/ua" }),
    ).toEqual(["boschua", "bosch-ua", "bosch"]);
  });

  it("drops accents and punctuation", () => {
    expect(
      nameSlugs({ name: "Société Générale & Co.", siteUrl: null }),
    ).toEqual(["societegeneraleco", "societe-generale-co"]);
  });

  it("skips what has no Latin letters", () => {
    // Board names never contain Cyrillic: "Монобанк" gives only the domain.
    expect(
      nameSlugs({ name: "Монобанк", siteUrl: "https://monobank.ua" }),
    ).toEqual(["monobank"]);
  });

  it("looks past a career subdomain to the company", () => {
    expect(
      nameSlugs({ name: "", siteUrl: "https://careers.acme.example" }),
    ).toEqual(["acme"]);
  });
});
