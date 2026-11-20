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
    // JOIN тримає дошки на тому самому хості, що й свій сайт: дошку видно
    // лише за початком шляху.
    expect(knownAtsName("https://join.com/companies/acme")).toBe("JOIN");
    expect(knownAtsName("https://join.com/en")).toBeNull();
  });

  it("reads a normalized address without a protocol", () => {
    expect(knownAtsName("acme.recruitee.com")).toBe("Recruitee");
  });

  it("ignores the vendor's own website", () => {
    // Підпис «Powered by Teamtailor» веде на сайт постачальника, а не на дошку.
    expect(knownAtsName("https://www.teamtailor.com/")).toBeNull();
    expect(knownAtsName("https://teamtailor.com/pricing")).toBeNull();
  });

  it("is not fooled by a host that merely ends with a vendor domain", () => {
    expect(knownAtsName("https://notteamtailor.com/careers")).toBeNull();
  });

  it("knows nothing about platforms that have a parser", () => {
    expect(knownAtsName("https://jobs.lever.co/acme")).toBeNull();
    // Workable отримав парсер у задачі 6.25.
    expect(knownAtsName("https://apply.workable.com/acme/")).toBeNull();
    // BambooHR - у задачі 6.26.
    expect(knownAtsName("https://acme.bamboohr.com/careers")).toBeNull();
  });

  it("returns null for a company's own page and for garbage", () => {
    expect(knownAtsName("https://acme.example/careers")).toBeNull();
    expect(knownAtsName("not a url at all")).toBeNull();
  });
});
