import { describe, expect, it } from "vitest";

import { knownAtsName } from "./known-ats.ts";

describe("knownAtsName", () => {
  it("names an ATS that keeps the company in a subdomain", () => {
    expect(knownAtsName("https://acme.recruitee.com/o/designer")).toBe(
      "Recruitee",
    );
    expect(knownAtsName("https://acme.teamtailor.com/jobs/123")).toBe(
      "Teamtailor",
    );
  });

  it("names an ATS that keeps the company in the path of a shared host", () => {
    expect(knownAtsName("https://jobs.smartrecruiters.com/Acme")).toBe(
      "SmartRecruiters",
    );
  });

  it("names an ATS that shares its host with the vendor's website", () => {
    // JOIN keeps boards on the same host as its own site: a board is visible only
    // by the start of the path.
    expect(knownAtsName("https://join.com/companies/acme")).toBe("JOIN");
    expect(knownAtsName("https://join.com/en")).toBeNull();
  });

  it("reads a normalized address without a protocol", () => {
    expect(knownAtsName("acme.recruitee.com")).toBe("Recruitee");
  });

  it("ignores the vendor's own website", () => {
    // The "Powered by Teamtailor" credit leads to the vendor's site, not to a board.
    expect(knownAtsName("https://www.teamtailor.com/")).toBeNull();
    expect(knownAtsName("https://teamtailor.com/pricing")).toBeNull();
  });

  it("is not fooled by a host that merely ends with a vendor domain", () => {
    expect(knownAtsName("https://notteamtailor.com/careers")).toBeNull();
  });

  it("knows nothing about platforms that have a parser", () => {
    expect(knownAtsName("https://jobs.lever.co/acme")).toBeNull();
    // Workable got a parser in task 6.25.
    expect(knownAtsName("https://apply.workable.com/acme/")).toBeNull();
    // BambooHR in task 6.26, Pinpoint in 6.27.
    expect(knownAtsName("https://acme.bamboohr.com/careers")).toBeNull();
    expect(knownAtsName("https://acme.pinpointhq.com/")).toBeNull();
  });

  it("returns null for a company's own page and for garbage", () => {
    expect(knownAtsName("https://acme.example/careers")).toBeNull();
    expect(knownAtsName("not a url at all")).toBeNull();
  });
});
