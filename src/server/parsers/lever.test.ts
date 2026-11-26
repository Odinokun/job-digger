import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { leverSite, parseLeverPostings } from "./lever.ts";

/** A real Lever response for the leverdemo demo site (src/server/http/testing). */
const leverdemo: unknown = JSON.parse(
  readFileSync(
    new URL(
      "../http/testing/responses/api.lever.co/v0/postings/leverdemo",
      import.meta.url,
    ),
    "utf8",
  ),
);

/** A minimal posting in the API format - for hand-made cases. */
function posting(fields: Record<string, unknown>) {
  return {
    id: "5ac21346-8e0c-4494-8e7a-3eb92ff77902",
    text: "Engineer",
    hostedUrl:
      "https://jobs.lever.co/acme/5ac21346-8e0c-4494-8e7a-3eb92ff77902",
    categories: { location: "Kyiv", allLocations: ["Kyiv"] },
    ...fields,
  };
}

describe("leverSite", () => {
  it("takes the site from a job board address", () => {
    expect(leverSite("https://jobs.lever.co/palantir")).toEqual({
      site: "palantir",
      region: "global",
    });
  });

  it("takes the site from a link to one posting or its apply form", () => {
    expect(
      leverSite(
        "https://jobs.lever.co/palantir/6ed76ce8-4156-4b60-b120-403538bd66cd/apply",
      ),
    ).toEqual({ site: "palantir", region: "global" });
  });

  it("knows the EU job board", () => {
    expect(leverSite("https://jobs.eu.lever.co/lever")).toEqual({
      site: "lever",
      region: "eu",
    });
  });

  it("finds no site where there is none", () => {
    expect(leverSite("https://jobs.lever.co/")).toBeNull();
    expect(leverSite("https://lever.co/palantir")).toBeNull();
    expect(leverSite("https://job-boards.greenhouse.io/discord")).toBeNull();
    expect(leverSite("not an address")).toBeNull();
  });
});

describe("parseLeverPostings", () => {
  it("reads every posting of a real response", () => {
    const result = parseLeverPostings(leverdemo);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.vacancies).toHaveLength(10);
    for (const vacancy of result.vacancies) {
      expect(vacancy.url).toMatch(/^https:\/\/jobs\.lever\.co\/leverdemo\//);
    }
  });

  it("maps the fields of one posting", () => {
    expect(parseLeverPostings([posting({})])).toEqual({
      ok: true,
      vacancies: [
        {
          externalId: "5ac21346-8e0c-4494-8e7a-3eb92ff77902",
          title: "Engineer",
          url: "https://jobs.lever.co/acme/5ac21346-8e0c-4494-8e7a-3eb92ff77902",
          location: "Kyiv",
        },
      ],
      skipped: 0,
    });
  });

  it("lists every location of a posting with several", () => {
    const result = parseLeverPostings([
      posting({
        categories: {
          location: "Kyiv",
          allLocations: ["Kyiv", "Lviv", "Remote"],
        },
      }),
    ]);

    expect(result.ok && result.vacancies[0].location).toBe(
      "Kyiv, Lviv, Remote",
    );
  });

  it("falls back to the primary location, then to none", () => {
    const primary = parseLeverPostings([
      posting({ categories: { location: " Kyiv " } }),
    ]);
    const none = parseLeverPostings([posting({ categories: {} })]);

    expect(primary.ok && primary.vacancies[0].location).toBe("Kyiv");
    expect(none.ok && none.vacancies[0].location).toBeNull();
  });

  it("reads an empty site as no vacancies", () => {
    expect(parseLeverPostings([])).toEqual({
      ok: true,
      vacancies: [],
      skipped: 0,
    });
  });

  it("fails the whole response when it is not a list", () => {
    expect(parseLeverPostings({ ok: false })).toEqual({
      ok: false,
      error: { reason: "unreadable" },
    });
  });

  it("skips a posting with an empty title or a non-web address and counts it", () => {
    const result = parseLeverPostings([
      posting({}),
      posting({ id: "b", text: " " }),
      posting({ id: "c", hostedUrl: "javascript:alert(1)" }),
    ]);

    expect(result.ok && result.vacancies).toHaveLength(1);
    expect(result.ok && result.skipped).toBe(2);
  });

  it("fails the whole response on one posting with a broken structure", () => {
    const unreadable = { ok: false, error: { reason: "unreadable" } };

    expect(parseLeverPostings([posting({}), posting({ text: 7 })])).toEqual(
      unreadable,
    );
    expect(parseLeverPostings([posting({ id: 42 })])).toEqual(unreadable);
    expect(parseLeverPostings([posting({ hostedUrl: null })])).toEqual(
      unreadable,
    );
  });
});
