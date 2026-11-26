import { describe, expect, it } from "vitest";

import { boardUrlOf } from "./board-url.ts";

describe("boardUrlOf", () => {
  // The company site leads not only to the board itself but also to a single
  // vacancy or an application form. The source is always the board: the parser
  // reads it, and two different vacancies of one board must give one finding.
  const cases: Array<[string, string, string]> = [
    [
      "https://boards.greenhouse.io/discord/jobs/4567",
      "https://job-boards.greenhouse.io/discord",
      "greenhouse",
    ],
    [
      "https://boards.greenhouse.io/embed/job_board?for=discord",
      "https://job-boards.greenhouse.io/discord",
      "greenhouse",
    ],
    [
      "https://jobs.lever.co/leverdemo/5ac21346-8e0c-4494-8e7a-3eb92ff77902/apply",
      "https://jobs.lever.co/leverdemo",
      "lever",
    ],
    ["https://jobs.eu.lever.co/acme", "https://jobs.eu.lever.co/acme", "lever"],
    [
      "https://jobs.ashbyhq.com/linear/123/application",
      "https://jobs.ashbyhq.com/linear",
      "ashby",
    ],
    [
      "https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/Warsaw/Engineer_JR1",
      "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite",
      "workday",
    ],
    [
      "https://team.peopleforce.io/careers/v/12345-engineer",
      "https://team.peopleforce.io/careers",
      "peopleforce",
    ],
    [
      "https://acme.breezy.hr/p/98323abf2296-designer?source=site",
      "https://acme.breezy.hr",
      "breezy",
    ],
    [
      "https://cleverstaff.net/i/8allocate-vacancies/description",
      "https://cleverstaff.net/i/8allocate-vacancies",
      "cleverstaff",
    ],
    [
      "https://cleverstaff.net/i/vacancy-3ONpJV",
      "https://cleverstaff.net/i/vacancy-3ONpJV",
      "cleverstaff",
    ],
    [
      "https://spribe.hurma.work/public-vacancies/72?lang=en",
      "https://spribe.hurma.work/public-vacancies",
      "hurma",
    ],
    [
      "https://astrafy.jobs.personio.de/job/2888194?language=en",
      "https://astrafy.jobs.personio.de",
      "personio",
    ],
    [
      "https://dps.softgarden.io/job/17623206/x?jobDbPVId=1&l=en",
      "https://dps.softgarden.io/en/vacancies",
      "softgarden",
    ],
    [
      "https://spinncloud.career.softgarden.de/jobs/29892564/x/",
      "https://spinncloud.career.softgarden.de",
      "softgarden",
    ],
  ];

  for (const [link, url, platform] of cases) {
    it(`turns ${link} into its board`, () => {
      expect(boardUrlOf(link)).toEqual({ url, platform });
    });
  }

  it("ignores links that are not job boards", () => {
    expect(boardUrlOf("https://www.linkedin.com/company/acme")).toBeNull();
    expect(boardUrlOf("https://acme.example/careers")).toBeNull();
  });

  it("ignores a platform's own pages without a board", () => {
    // The platform's own site, not a company board: "Powered by Greenhouse" in
    // the footer of a career page is common.
    expect(boardUrlOf("https://boards.greenhouse.io/")).toBeNull();
    expect(boardUrlOf("https://www.peopleforce.io/")).toBeNull();
    // The Breezy embedded board script lives on its CDN.
    expect(boardUrlOf("https://assets-cdn.breezy.hr/x.js")).toBeNull();
    expect(boardUrlOf("https://cleverstaff.net/why.html")).toBeNull();
    // Hurma's help centre is on its subdomain, like the company boards.
    expect(boardUrlOf("https://support.hurma.work/en")).toBeNull();
    expect(boardUrlOf("https://www.jobs.personio.de/")).toBeNull();
    expect(boardUrlOf("https://www.softgarden.io/")).toBeNull();
  });

  it("ignores what is not a web address", () => {
    expect(boardUrlOf("mailto:jobs@acme.example")).toBeNull();
    expect(boardUrlOf("not a url")).toBeNull();
  });
});
