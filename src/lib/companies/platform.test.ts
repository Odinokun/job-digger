import { describe, expect, it } from "vitest";

import { detectPlatform } from "./platform.ts";

describe("detectPlatform", () => {
  it("reads greenhouse from both of its board hosts", () => {
    expect(detectPlatform("boards.greenhouse.io/gitlab")).toBe("greenhouse");
    expect(detectPlatform("job-boards.greenhouse.io/gitlab")).toBe(
      "greenhouse",
    );
  });

  it("reads lever, including its eu host", () => {
    expect(detectPlatform("jobs.lever.co/spotify")).toBe("lever");
    expect(detectPlatform("jobs.eu.lever.co/spotify")).toBe("lever");
  });

  it("reads ashby", () => {
    expect(detectPlatform("jobs.ashbyhq.com/linear")).toBe("ashby");
  });

  it("reads workday from both of its career site domains", () => {
    expect(
      detectPlatform("nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite"),
    ).toBe("workday");
    expect(detectPlatform("wd3.myworkdaysite.com/recruiting/acme/jobs")).toBe(
      "workday",
    );
  });

  it("reads peopleforce", () => {
    expect(detectPlatform("careers.peopleforce.io")).toBe("peopleforce");
  });

  it("reads breezy", () => {
    expect(detectPlatform("acme.breezy.hr")).toBe("breezy");
    expect(detectPlatform("acme.breezy.hr/p/98323abf2296-designer")).toBe(
      "breezy",
    );
  });

  it("reads cleverstaff", () => {
    expect(detectPlatform("cleverstaff.net/i/8allocate-vacancies")).toBe(
      "cleverstaff",
    );
  });

  it("reads hurma", () => {
    expect(detectPlatform("spribe.hurma.work/public-vacancies")).toBe("hurma");
    expect(detectPlatform("spribe.hurma.work/public-vacancies/72")).toBe(
      "hurma",
    );
  });

  it("reads personio on both domains", () => {
    expect(detectPlatform("astrafy.jobs.personio.de")).toBe("personio");
    expect(detectPlatform("astrafy.jobs.personio.com/job/2888194")).toBe(
      "personio",
    );
    // Personio's own site is not a board.
    expect(detectPlatform("www.personio.com/careers")).toBe("unsupported");
  });

  it("reads softgarden boards and career sites", () => {
    expect(detectPlatform("dps.softgarden.io/en/vacancies")).toBe("softgarden");
    expect(detectPlatform("spinncloud.career.softgarden.de/en")).toBe(
      "softgarden",
    );
    // softgarden scripts and styles are not a board.
    expect(detectPlatform("static.softgarden.de/x.js")).toBe("unsupported");
  });

  it("falls back to unsupported for a page on the company's own domain", () => {
    expect(detectPlatform("www.lifeatspotify.com/jobs")).toBe("unsupported");
  });

  it("is not fooled by a host that merely contains a platform domain", () => {
    // The domain label boundary is compared, not just the end of the string:
    // otherwise anyone could name their domain so that we take it for an ATS.
    expect(detectPlatform("not-greenhouse.io/jobs")).toBe("unsupported");
    expect(detectPlatform("greenhouse.io.example.com/jobs")).toBe(
      "unsupported",
    );
    expect(detectPlatform("lever.co.attacker.example")).toBe("unsupported");
  });

  it("ignores the path and the query of the address", () => {
    expect(detectPlatform("jobs.lever.co")).toBe("lever");
    expect(detectPlatform("jobs.lever.co/spotify?team=eng")).toBe("lever");
  });

  it("never guesses job posting markup, because the address cannot show it", () => {
    // Only the page content can give schema_org, never the address.
    const guesses = [
      "careers.acme.example",
      "acme.example/jobs",
      "schema.org/JobPosting",
    ].map(detectPlatform);

    expect(guesses).not.toContain("schema_org");
  });
});
