import { describe, expect, it } from "vitest";

import { prepareCareerSource } from "./career-source.ts";

describe("prepareCareerSource", () => {
  it("keeps the address as typed and derives the platform", () => {
    expect(
      prepareCareerSource({
        url: "boards.greenhouse.io/bosch",
        existingUrls: [],
      }),
    ).toEqual({
      ok: true,
      url: "https://boards.greenhouse.io/bosch",
      normalizedUrl: "boards.greenhouse.io/bosch",
      label: null,
      platform: "greenhouse",
      isTracked: true,
    });
  });

  it("keeps a page nothing can read, but not tracked", () => {
    expect(
      prepareCareerSource({
        url: "https://www.mozilla.org/en-US/careers/listings/",
        existingUrls: [],
      }),
    ).toEqual({
      ok: true,
      url: "https://www.mozilla.org/en-US/careers/listings/",
      // `www.` and the trailing slash are dropped, because this is the form that goes
      // into `career_sources.normalized_url` and serves the comparison.
      normalizedUrl: "mozilla.org/en-US/careers/listings",
      label: null,
      platform: "unsupported",
      isTracked: false,
    });
  });

  it("trims the label and treats a blank one as no label", () => {
    expect(
      prepareCareerSource({
        url: "boards.greenhouse.io/bosch",
        label: "  Remote Canada  ",
        existingUrls: [],
      }),
    ).toMatchObject({ ok: true, label: "Remote Canada" });

    expect(
      prepareCareerSource({
        url: "boards.greenhouse.io/bosch",
        label: "   ",
        existingUrls: [],
      }),
    ).toMatchObject({ ok: true, label: null });
  });

  it("refuses an address it cannot use and says why", () => {
    expect(prepareCareerSource({ url: "  ", existingUrls: [] })).toEqual({
      ok: false,
      problem: "url",
      reason: "empty",
    });

    expect(
      prepareCareerSource({ url: "ftp://bosch.com", existingUrls: [] }),
    ).toEqual({
      ok: false,
      problem: "url",
      reason: "unsupported-scheme",
    });
  });

  it("refuses an address the company already has", () => {
    expect(
      prepareCareerSource({
        url: "https://www.mozilla.org/en-US/careers/listings/",
        existingUrls: ["https://mozilla.org/en-US/careers/listings"],
      }),
    ).toEqual({ ok: false, problem: "duplicate" });
  });

  // Exactly the case card 2.16 asked for: three filters of one page are three
  // separate sources.
  it("takes an address that differs only by its query", () => {
    expect(
      prepareCareerSource({
        url: "https://www.mozilla.org/en-US/careers/listings/?location=Remote%20US",
        existingUrls: [
          "https://www.mozilla.org/en-US/careers/listings/?location=Remote%20Canada",
        ],
      }),
    ).toMatchObject({ ok: true });
  });

  // An address the database would no longer accept cannot end up in `existingUrls`,
  // but the list comes from the database, not from the form - no reason to fail on it.
  it("ignores an existing address it cannot normalize", () => {
    expect(
      prepareCareerSource({
        url: "boards.greenhouse.io/bosch",
        existingUrls: ["", "not a url at all"],
      }),
    ).toMatchObject({ ok: true });
  });
});
