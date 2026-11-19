import { describe, expect, it } from "vitest";

import { boardUrlOf } from "./board-url.ts";

describe("boardUrlOf", () => {
  // Сайт компанії веде не лише на саму дошку, а й на окрему вакансію чи форму
  // відгуку. Джерело - завжди дошка: її читає парсер, і дві різні вакансії
  // однієї дошки мають дати одну знахідку.
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
    // Сайт самої платформи, а не дошка компанії: «Powered by Greenhouse» у
    // футері кар'єрної сторінки трапляється часто.
    expect(boardUrlOf("https://boards.greenhouse.io/")).toBeNull();
    expect(boardUrlOf("https://www.peopleforce.io/")).toBeNull();
  });

  it("ignores what is not a web address", () => {
    expect(boardUrlOf("mailto:jobs@acme.example")).toBeNull();
    expect(boardUrlOf("not a url")).toBeNull();
  });
});
