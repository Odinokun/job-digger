import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ashbyBoard, parseAshbyJobs } from "./ashby.ts";

/** A real Ashby response for the Linear board (src/server/http/testing). */
const linear: unknown = JSON.parse(
  readFileSync(
    new URL(
      "../http/testing/responses/api.ashbyhq.com/posting-api/job-board/linear",
      import.meta.url,
    ),
    "utf8",
  ),
);

/** A minimal vacancy in the API format - for hand-made cases. */
function job(fields: Record<string, unknown>) {
  return {
    id: "d3bc1ced-3ce4-4086-a050-555055dbb1ff",
    title: "Engineer",
    jobUrl:
      "https://jobs.ashbyhq.com/acme/d3bc1ced-3ce4-4086-a050-555055dbb1ff",
    location: "Kyiv",
    secondaryLocations: [],
    isListed: true,
    ...fields,
  };
}

const UNREADABLE = { ok: false, error: { reason: "unreadable" } };

describe("ashbyBoard", () => {
  it("takes the board name from a job board address", () => {
    expect(ashbyBoard("https://jobs.ashbyhq.com/linear")).toBe("linear");
  });

  it("takes the board name from a link to one job or the embedded board", () => {
    expect(
      ashbyBoard(
        "https://jobs.ashbyhq.com/linear/d3bc1ced-3ce4-4086-a050-555055dbb1ff/application",
      ),
    ).toBe("linear");
    expect(ashbyBoard("https://jobs.ashbyhq.com/linear/embed")).toBe("linear");
  });

  it("finds no board where there is none", () => {
    expect(ashbyBoard("https://jobs.ashbyhq.com/")).toBeNull();
    expect(ashbyBoard("https://ashbyhq.com/linear")).toBeNull();
    expect(ashbyBoard("https://jobs.lever.co/linear")).toBeNull();
    expect(ashbyBoard("not an address")).toBeNull();
  });
});

describe("parseAshbyJobs", () => {
  it("reads every job of a real response", () => {
    const result = parseAshbyJobs(linear);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.vacancies).toHaveLength(33);
    for (const vacancy of result.vacancies) {
      expect(vacancy.url).toMatch(/^https:\/\/jobs\.ashbyhq\.com\/linear\//);
    }
  });

  it("maps the fields of one job", () => {
    expect(parseAshbyJobs({ jobs: [job({})] })).toEqual({
      ok: true,
      vacancies: [
        {
          externalId: "d3bc1ced-3ce4-4086-a050-555055dbb1ff",
          title: "Engineer",
          url: "https://jobs.ashbyhq.com/acme/d3bc1ced-3ce4-4086-a050-555055dbb1ff",
          location: "Kyiv",
        },
      ],
      skipped: 0,
    });
  });

  it("adds the secondary locations after the primary one", () => {
    const result = parseAshbyJobs({
      jobs: [
        job({
          location: "North America",
          secondaryLocations: [{ location: "Europe" }, { location: " " }],
        }),
      ],
    });

    expect(result.ok && result.vacancies[0].location).toBe(
      "North America, Europe",
    );
  });

  it("has no location when the job gives none", () => {
    const result = parseAshbyJobs({
      jobs: [job({ location: "", secondaryLocations: undefined })],
    });

    expect(result.ok && result.vacancies[0].location).toBeNull();
  });

  it("skips jobs that are not listed on the board", () => {
    // `isListed: false` means the vacancy is reachable only by a direct link and
    // not visible on the company board (Ashby documentation).
    const result = parseAshbyJobs({
      jobs: [job({}), job({ id: "hidden", isListed: false })],
    });

    expect(result.ok && result.vacancies.map((v) => v.externalId)).toEqual([
      "d3bc1ced-3ce4-4086-a050-555055dbb1ff",
    ]);
  });

  it("reads an empty board as no vacancies", () => {
    expect(parseAshbyJobs({ jobs: [] })).toEqual({
      ok: true,
      vacancies: [],
      skipped: 0,
    });
  });

  it("fails the whole response when it is not a board", () => {
    expect(parseAshbyJobs([])).toEqual(UNREADABLE);
    expect(parseAshbyJobs({ apiVersion: "1" })).toEqual(UNREADABLE);
  });

  it("skips a job with an empty title or a non-web address and counts it", () => {
    // A real case: one of 839 vacancies on the OpenAI board had an empty title
    // (18.11.2026). The whole board should not disappear because of it.
    const result = parseAshbyJobs({
      jobs: [
        job({}),
        job({ id: "b", title: "" }),
        job({ id: "c", jobUrl: "javascript:alert(1)" }),
      ],
    });

    expect(result.ok && result.vacancies).toHaveLength(1);
    expect(result.ok && result.skipped).toBe(2);
  });

  it("does not count unlisted jobs as skipped", () => {
    const result = parseAshbyJobs({
      jobs: [job({}), job({ id: "hidden", isListed: false })],
    });

    expect(result.ok && result.skipped).toBe(0);
  });

  it("fails the whole response on one job with a broken structure", () => {
    expect(parseAshbyJobs({ jobs: [job({}), job({ title: 5 })] })).toEqual(
      UNREADABLE,
    );
    expect(parseAshbyJobs({ jobs: [job({ id: 7 })] })).toEqual(UNREADABLE);
    expect(parseAshbyJobs({ jobs: [job({ jobUrl: null })] })).toEqual(
      UNREADABLE,
    );
  });
});
