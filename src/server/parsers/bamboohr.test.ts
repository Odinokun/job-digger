import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { bamboohrCompany, parseBambooHrList } from "./bamboohr.ts";

/** Справжня відповідь `/careers/list` BambooHR, компанія Altenar (src/server/http/testing). */
const altenar: unknown = JSON.parse(
  readFileSync(
    new URL(
      "../http/testing/responses/altenar.bamboohr.com/careers/list",
      import.meta.url,
    ),
    "utf8",
  ),
);

describe("bamboohrCompany", () => {
  it("reads the company from the careers page and from a job", () => {
    expect(bamboohrCompany("https://altenar.bamboohr.com/careers")).toBe(
      "altenar",
    );
    expect(bamboohrCompany("https://altenar.bamboohr.com/careers/88")).toBe(
      "altenar",
    );
    expect(bamboohrCompany("https://Altenar.BambooHR.com/jobs/")).toBe(
      "altenar",
    );
  });

  it("is null for BambooHR's own website and for other sites", () => {
    expect(bamboohrCompany("https://www.bamboohr.com/")).toBeNull();
    expect(bamboohrCompany("https://bamboohr.com/pricing")).toBeNull();
    expect(bamboohrCompany("https://acme.example/careers")).toBeNull();
    expect(bamboohrCompany("not a url")).toBeNull();
  });
});

describe("parseBambooHrList", () => {
  it("reads every job of a real careers page", () => {
    const result = parseBambooHrList(altenar, "altenar");

    expect(result).toMatchObject({ ok: true, skipped: 0 });
    if (!result.ok) return;
    expect(result.vacancies).toHaveLength(12);
    expect(result.vacancies[0]).toEqual({
      externalId: "88",
      title: "Senior Go Developer",
      // У JSON посилання немає - сторінка вакансії `/careers/{id}`.
      url: "https://altenar.bamboohr.com/careers/88",
      location: "St Julians, Malta",
    });
    // Порожнє `location` - місце з `atsLocation`.
    expect(result.vacancies).toContainEqual(
      expect.objectContaining({ externalId: "247", location: "Serbia" }),
    );
  });

  it("trims the title and reads a job without a location", () => {
    expect(
      parseBambooHrList(
        {
          meta: { totalCount: 1 },
          result: [{ id: "7", jobOpeningName: " Designer  ", location: {} }],
        },
        "acme",
      ),
    ).toEqual({
      ok: true,
      skipped: 0,
      vacancies: [
        {
          externalId: "7",
          title: "Designer",
          url: "https://acme.bamboohr.com/careers/7",
          location: null,
        },
      ],
    });
  });

  it("skips a job without a title and refuses a broken one", () => {
    expect(
      parseBambooHrList(
        {
          result: [
            { id: "1", jobOpeningName: "" },
            { id: "2", jobOpeningName: "Ok" },
          ],
        },
        "acme",
      ),
    ).toMatchObject({ ok: true, skipped: 1 });
    expect(
      parseBambooHrList({ result: [{ id: 3, jobOpeningName: "Ok" }] }, "acme"),
    ).toEqual({ ok: false, error: { reason: "unreadable" } });
  });

  it("refuses an answer that is not a careers list", () => {
    expect(parseBambooHrList([], "acme")).toEqual({
      ok: false,
      error: { reason: "unreadable" },
    });
    expect(parseBambooHrList({ meta: {} }, "acme")).toEqual({
      ok: false,
      error: { reason: "unreadable" },
    });
  });
});
