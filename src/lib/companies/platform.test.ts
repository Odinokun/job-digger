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

  it("falls back to unsupported for a page on the company's own domain", () => {
    expect(detectPlatform("www.lifeatspotify.com/jobs")).toBe("unsupported");
  });

  it("is not fooled by a host that merely contains a platform domain", () => {
    // Порівнюється межа лейбла домену, а не просто кінець рядка: інакше
    // будь-хто міг би назвати свій домен так, щоб ми прийняли його за ATS.
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
    // schema_org дає лише пробне читання сторінки (етап 3), а не адреса.
    const guesses = [
      "careers.acme.example",
      "acme.example/jobs",
      "schema.org/JobPosting",
    ].map(detectPlatform);

    expect(guesses).not.toContain("schema_org");
  });
});
