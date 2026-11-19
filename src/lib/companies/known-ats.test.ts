import { describe, expect, it } from "vitest";

import { knownAtsName } from "./known-ats.ts";

describe("knownAtsName", () => {
  it("names an ATS that keeps the company in a subdomain", () => {
    expect(knownAtsName("https://acme.bamboohr.com/careers")).toBe("BambooHR");
    expect(knownAtsName("https://acme.jobs.personio.de/job/123")).toBe(
      "Personio",
    );
  });

  it("names an ATS that keeps the company in the path of a shared host", () => {
    expect(knownAtsName("https://apply.workable.com/acme/")).toBe("Workable");
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

  it("ignores the vendor's own services on its domain", () => {
    expect(knownAtsName("https://acme.hurma.work/")).toBe("Hurma");
    expect(knownAtsName("https://academy.hurma.work/hr-club")).toBeNull();
    expect(knownAtsName("https://support.hurma.work/en")).toBeNull();
  });

  it("reads a normalized address without a protocol", () => {
    expect(knownAtsName("acme.recruitee.com")).toBe("Recruitee");
  });

  it("ignores the vendor's own website", () => {
    // Підпис «Powered by BambooHR» веде на сайт постачальника, а не на дошку.
    expect(knownAtsName("https://www.bamboohr.com/")).toBeNull();
    expect(knownAtsName("https://bamboohr.com/pricing")).toBeNull();
    expect(knownAtsName("https://www.workable.com/")).toBeNull();
  });

  it("is not fooled by a host that merely ends with a vendor domain", () => {
    expect(knownAtsName("https://notbamboohr.com/careers")).toBeNull();
  });

  it("knows nothing about platforms that have a parser", () => {
    expect(knownAtsName("https://jobs.lever.co/acme")).toBeNull();
  });

  it("returns null for a company's own page and for garbage", () => {
    expect(knownAtsName("https://acme.example/careers")).toBeNull();
    expect(knownAtsName("not a url at all")).toBeNull();
  });
});
