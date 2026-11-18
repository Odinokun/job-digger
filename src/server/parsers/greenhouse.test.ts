import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { greenhouseBoardToken, parseGreenhouseJobs } from "./greenhouse.ts";

/** Справжня відповідь Greenhouse для дошки Discord (src/server/http/testing). */
const discordJobs: unknown = JSON.parse(
  readFileSync(
    new URL(
      "../http/testing/responses/boards-api.greenhouse.io/v1/boards/discord/jobs",
      import.meta.url,
    ),
    "utf8",
  ),
);

/** Мінімальна вакансія у форматі API - для ручних випадків. */
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
    // Значення виписані з файлу відповіді руками, а не обчислені кодом.
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

  it("refuses the whole answer when one vacancy lacks a title or address", () => {
    // Не відкидаємо криву вакансію поодинці: якщо зміниться формат, «відкинулись
    // би» всі, і порожній список закрив би всі вакансії джерела (3.13).
    for (const broken of [
      job({ title: "" }),
      job({ title: undefined }),
      job({ absolute_url: "not an address" }),
      // Посилання в UI приймаються лише http/https (docs/security.md, пункт 4).
      job({ absolute_url: "javascript:alert(1)" }),
      job({ id: undefined }),
    ]) {
      expect(parseGreenhouseJobs({ jobs: [job({}), broken] })).toEqual({
        ok: false,
        error: { reason: "unreadable" },
      });
    }
  });
});
