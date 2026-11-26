import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { greenhouseBoardToken, parseGreenhouseJobs } from "./greenhouse.ts";

/** A real Greenhouse response for the Discord board (src/server/http/testing). */
const discordJobs: unknown = JSON.parse(
  readFileSync(
    new URL(
      "../http/testing/responses/boards-api.greenhouse.io/v1/boards/discord/jobs",
      import.meta.url,
    ),
    "utf8",
  ),
);

/** A minimal vacancy in the API format - for hand-made cases. */
function job(fields: Record<string, unknown>) {
  return {
    id: 1,
    title: "Engineer",
    absolute_url: "https://job-boards.greenhouse.io/acme/jobs/1",
    location: { name: "Kyiv" },
    ...fields,
  };
}

describe("greenhouseBoardToken", () => {
  it("takes the board name from a board address on either Greenhouse host", () => {
    expect(
      greenhouseBoardToken("https://job-boards.greenhouse.io/discord"),
    ).toBe("discord");
    expect(greenhouseBoardToken("https://boards.greenhouse.io/discord")).toBe(
      "discord",
    );
  });

  it("takes the board name from a link to one vacancy", () => {
    expect(
      greenhouseBoardToken(
        "https://job-boards.greenhouse.io/discord/jobs/8927168002",
      ),
    ).toBe("discord");
  });

  it("takes the board name from an embedded board", () => {
    expect(
      greenhouseBoardToken(
        "https://boards.greenhouse.io/embed/job_board?for=discord",
      ),
    ).toBe("discord");
  });

  it("finds no board where there is none", () => {
    expect(
      greenhouseBoardToken("https://job-boards.greenhouse.io/"),
    ).toBeNull();
    expect(
      greenhouseBoardToken("https://boards.greenhouse.io/embed/job_board"),
    ).toBeNull();
    expect(greenhouseBoardToken("https://bosch.com/careers")).toBeNull();
  });
});

describe("parseGreenhouseJobs", () => {
  it("reads every vacancy of a real board", () => {
    const result = parseGreenhouseJobs(discordJobs);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.vacancies).toHaveLength(26);
    // The values are copied from the response file by hand, not computed by code.
    expect(result.vacancies[0]).toEqual({
      externalId: "8927168002",
      title: "Account Executive, Mobile Gaming & Apps",
      url: "https://job-boards.greenhouse.io/discord/jobs/8927168002",
      location: "San Francisco Bay Area, Los Angeles",
    });
  });

  it("leaves the location empty when the board gives none", () => {
    const result = parseGreenhouseJobs({
      jobs: [
        job({ id: 1, location: null }),
        job({ id: 2, location: { name: "  " } }),
        job({ id: 3, location: undefined }),
      ],
    });

    expect(result.ok && result.vacancies.map((v) => v.location)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("refuses an answer that is not a list of jobs", () => {
    for (const answer of [null, "html", {}, { jobs: "none" }]) {
      expect(parseGreenhouseJobs(answer), JSON.stringify(answer)).toEqual({
        ok: false,
        error: { reason: "unreadable" },
      });
    }
  });

  it("skips a vacancy with an empty title or a non-web address and counts it", () => {
    // Bad data in one vacancy, not a format change (src/server/parsers/README.md).
    // Links in the UI are http/https only (CLAUDE.md, "Security").
    for (const bad of [
      job({ id: 2, title: "  " }),
      job({ id: 2, absolute_url: "not an address" }),
      job({ id: 2, absolute_url: "javascript:alert(1)" }),
    ]) {
      const result = parseGreenhouseJobs({ jobs: [job({}), bad] });

      expect(result.ok && result.vacancies.map((v) => v.externalId)).toEqual([
        "1",
      ]);
      expect(result.ok && result.skipped).toBe(1);
    }
  });

  it("refuses the whole answer when one vacancy has a broken structure", () => {
    // A field of the wrong type or a missing id signals a format change: skipping
    // such records would mean skipping all and deleting the source's vacancies (3.13).
    for (const broken of [
      job({ title: undefined }),
      job({ title: 42 }),
      job({ absolute_url: undefined }),
      job({ id: undefined }),
    ]) {
      expect(parseGreenhouseJobs({ jobs: [job({}), broken] })).toEqual({
        ok: false,
        error: { reason: "unreadable" },
      });
    }
  });
});
