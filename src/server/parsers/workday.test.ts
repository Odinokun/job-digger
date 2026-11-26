import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseWorkdayJobs, workdaySite } from "./workday.ts";

/**
 * A real Workday response: the NVIDIA site, a "Warsaw" search - 11 vacancies,
 * one page (src/server/http/testing).
 */
const nvidiaWarsaw: unknown = JSON.parse(
  readFileSync(
    new URL(
      "../http/testing/responses/nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs",
      import.meta.url,
    ),
    "utf8",
  ),
);

const NVIDIA_JOBS =
  "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite";

/** A minimal vacancy in the API format - for hand-made cases. */
function posting(fields: Record<string, unknown>) {
  return {
    title: "Engineer",
    externalPath: "/job/Poland-Warsaw/Engineer_JR1",
    locationsText: "Poland, Warsaw",
    postedOn: "Posted Today",
    bulletFields: ["JR1"],
    ...fields,
  };
}

const UNREADABLE = { ok: false, error: { reason: "unreadable" } };

describe("workdaySite", () => {
  it("reads a career site on myworkdayjobs.com", () => {
    expect(
      workdaySite(
        "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite",
      ),
    ).toEqual({
      api: "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs",
      jobBase: NVIDIA_JOBS,
    });
  });

  it("skips the language segment and reads links to one job", () => {
    const expected = workdaySite(NVIDIA_JOBS);

    expect(
      workdaySite(
        "https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite",
      ),
    ).toEqual(expected);
    expect(
      workdaySite(
        "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/Poland-Warsaw/Engineer_JR1",
      ),
    ).toEqual(expected);
  });

  it("reads a career site on myworkdaysite.com", () => {
    expect(
      workdaySite(
        "https://wd5.myworkdaysite.com/en-US/recruiting/nvidia/NVIDIAExternalCareerSite",
      ),
    ).toEqual({
      api: "https://wd5.myworkdaysite.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs",
      jobBase:
        "https://wd5.myworkdaysite.com/recruiting/nvidia/NVIDIAExternalCareerSite",
    });
  });

  it("finds no site where there is none", () => {
    expect(workdaySite("https://nvidia.wd5.myworkdayjobs.com/")).toBeNull();
    expect(
      workdaySite("https://nvidia.wd5.myworkdayjobs.com/en-US"),
    ).toBeNull();
    expect(workdaySite("https://myworkdayjobs.com/External")).toBeNull();
    expect(
      workdaySite("https://wd5.myworkdaysite.com/recruiting/nvidia"),
    ).toBeNull();
    expect(workdaySite("https://wd5.myworkdaysite.com/nvidia/Site")).toBeNull();
    expect(workdaySite("https://jobs.lever.co/nvidia")).toBeNull();
    expect(workdaySite("not an address")).toBeNull();
  });
});

describe("parseWorkdayJobs", () => {
  it("reads every job of a real response", () => {
    const result = parseWorkdayJobs(nvidiaWarsaw, NVIDIA_JOBS);

    expect(result.ok && result.vacancies).toHaveLength(11);
    expect(result.ok && result.skipped).toBe(0);
  });

  it("takes the job path as the ID and builds the link from it", () => {
    // The requisition number (`bulletFields`) will not do: one requisition can
    // have several postings - `..._JR2028965-1` with `bulletFields: ["JR2028965"]`.
    const result = parseWorkdayJobs(
      {
        total: 1,
        jobPostings: [
          posting({
            title: " General Account Manager CEE ",
            externalPath:
              "/job/Poland-Warsaw/General-Account-Manager-CEE_JR2028965-1",
            bulletFields: ["JR2028965"],
          }),
        ],
      },
      NVIDIA_JOBS,
    );

    expect(result).toEqual({
      ok: true,
      skipped: 0,
      vacancies: [
        {
          externalId:
            "/job/Poland-Warsaw/General-Account-Manager-CEE_JR2028965-1",
          title: "General Account Manager CEE",
          url: `${NVIDIA_JOBS}/job/Poland-Warsaw/General-Account-Manager-CEE_JR2028965-1`,
          location: "Poland, Warsaw",
        },
      ],
    });
  });

  it("keeps the location text as Workday gives it, or none", () => {
    const result = parseWorkdayJobs(
      {
        jobPostings: [
          posting({ externalPath: "/job/a_1", locationsText: "2 Locations" }),
          posting({ externalPath: "/job/b_2", locationsText: " " }),
          posting({ externalPath: "/job/c_3", locationsText: undefined }),
        ],
      },
      NVIDIA_JOBS,
    );

    expect(
      result.ok && result.vacancies.map((vacancy) => vacancy.location),
    ).toEqual(["2 Locations", null, null]);
  });

  it("skips a job without a title and counts it", () => {
    const result = parseWorkdayJobs(
      {
        jobPostings: [
          posting({ externalPath: "/job/a_1" }),
          posting({ externalPath: "/job/b_2", title: "  " }),
        ],
      },
      NVIDIA_JOBS,
    );

    expect(result.ok && result.vacancies).toHaveLength(1);
    expect(result.ok && result.skipped).toBe(1);
  });

  it("fails the whole answer when a job's structure is broken", () => {
    for (const broken of [
      posting({ externalPath: undefined }),
      posting({ externalPath: "" }),
      posting({ externalPath: "job/without-slash" }),
      posting({ title: 42 }),
    ]) {
      expect(
        parseWorkdayJobs({ jobPostings: [posting({}), broken] }, NVIDIA_JOBS),
      ).toEqual(UNREADABLE);
    }
  });

  it("refuses an answer that is not a job list", () => {
    expect(parseWorkdayJobs([], NVIDIA_JOBS)).toEqual(UNREADABLE);
    expect(parseWorkdayJobs({ total: 0 }, NVIDIA_JOBS)).toEqual(UNREADABLE);
    expect(parseWorkdayJobs(null, NVIDIA_JOBS)).toEqual(UNREADABLE);
  });

  it("reads an empty list as no jobs", () => {
    expect(
      parseWorkdayJobs({ total: 0, jobPostings: [] }, NVIDIA_JOBS),
    ).toEqual({ ok: true, vacancies: [], skipped: 0 });
  });
});
