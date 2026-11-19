import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { breezyCompany, parseBreezyPositions } from "./breezy.ts";

/** Справжня відповідь `/json` дошки Breezy (src/server/http/testing). */
function saved(host: string): unknown {
  return JSON.parse(
    readFileSync(
      new URL(`../http/testing/responses/${host}/json`, import.meta.url),
      "utf8",
    ),
  );
}

describe("breezyCompany", () => {
  it("reads the company from the board and from a position", () => {
    expect(breezyCompany("https://acme.breezy.hr")).toBe("acme");
    expect(
      breezyCompany("https://acme.breezy.hr/p/98323abf2296-designer"),
    ).toBe("acme");
    expect(breezyCompany("https://Acme.breezy.hr/json")).toBe("acme");
  });

  it("is null for Breezy's own services and for other sites", () => {
    // Скрипти й стилі вбудованої дошки лежать на `assets-cdn.breezy.hr`.
    expect(breezyCompany("https://assets-cdn.breezy.hr/x.js")).toBeNull();
    expect(breezyCompany("https://app.breezy.hr/signin")).toBeNull();
    expect(breezyCompany("https://www.breezy.hr/")).toBeNull();
    expect(breezyCompany("https://breezy.hr/")).toBeNull();
    expect(breezyCompany("https://acme.example/careers")).toBeNull();
    expect(breezyCompany("not a url")).toBeNull();
  });
});

describe("parseBreezyPositions", () => {
  it("reads every position of a real board", () => {
    const result = parseBreezyPositions(saved("breezy.breezy.hr"));

    expect(result).toEqual({
      ok: true,
      skipped: 0,
      vacancies: [
        {
          externalId: "98323abf2296",
          title: "Employee #12",
          url: "https://breezy.breezy.hr/p/98323abf2296-employee-12",
          location: "Chaos, FL",
        },
        {
          externalId: "088ac6d52139",
          title: "Open Position",
          url: "https://breezy.breezy.hr/p/088ac6d52139-open-position",
          location: "New York, NY",
        },
        {
          externalId: "4f4620daf613",
          title: "Position Title Details",
          url: "https://breezy.breezy.hr/p/4f4620daf613-position-title-details",
          location: "Sandy Hook, CT",
        },
      ],
    });
  });

  it("marks a remote position", () => {
    const result = parseBreezyPositions(saved("jobs.breezy.hr"));

    expect(result.ok && result.vacancies).toEqual([
      {
        externalId: "e827dcc56072",
        title: "Customer Success Agent",
        url: "https://jobs.breezy.hr/p/e827dcc56072-customer-success-agent",
        location: "United States, remote",
      },
    ]);
  });

  it("reads an empty board", () => {
    expect(parseBreezyPositions([])).toEqual({
      ok: true,
      vacancies: [],
      skipped: 0,
    });
  });

  it("skips a position with an empty title and leaves no location as null", () => {
    const result = parseBreezyPositions([
      { id: "a1", name: " ", url: "https://acme.breezy.hr/p/a1" },
      { id: "b2", name: "Designer", url: "https://acme.breezy.hr/p/b2" },
    ]);

    expect(result).toEqual({
      ok: true,
      skipped: 1,
      vacancies: [
        {
          externalId: "b2",
          title: "Designer",
          url: "https://acme.breezy.hr/p/b2",
          location: null,
        },
      ],
    });
  });

  it("fails on an answer that is not a list of positions", () => {
    expect(parseBreezyPositions({ positions: [] }).ok).toBe(false);
    expect(parseBreezyPositions([{ id: 1, name: "Designer" }]).ok).toBe(false);
  });
});
