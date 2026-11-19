import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { cleverstaffSource, parseCleverStaffVacancies } from "./cleverstaff.ts";

/** Справжня відповідь `getAllOpenVacancy` дошки 8allocate (src/server/http/testing). */
const eightAllocate: unknown = JSON.parse(
  readFileSync(
    new URL(
      "../http/testing/responses/cleverstaff.net/hr/public/getAllOpenVacancy",
      import.meta.url,
    ),
    "utf8",
  ),
);

describe("cleverstaffSource", () => {
  it("reads the company alias from its board", () => {
    expect(
      cleverstaffSource("https://cleverstaff.net/i/8allocate-vacancies"),
    ).toEqual({ alias: "8allocate" });
    // Аліас буває з дефісами й великими літерами, і регістр важливий:
    // `MEV` існує, `mev` - ні (перевірено 19.11.2026).
    expect(
      cleverstaffSource(
        "https://cleverstaff.net/i/-A-HR--vacancies/description",
      ),
    ).toEqual({ alias: "-A-HR-" });
  });

  it("reads the vacancy from a vacancy link", () => {
    expect(
      cleverstaffSource("https://cleverstaff.net/i/vacancy-3ONpJV"),
    ).toEqual({
      vacancy: "3ONpJV",
    });
  });

  it("is null for CleverStaff's own pages and for other sites", () => {
    expect(cleverstaffSource("https://cleverstaff.net/why.html")).toBeNull();
    expect(cleverstaffSource("https://cleverstaff.net/i/")).toBeNull();
    expect(
      cleverstaffSource("https://acme.example/i/acme-vacancies"),
    ).toBeNull();
    expect(cleverstaffSource("not a url")).toBeNull();
  });
});

describe("parseCleverStaffVacancies", () => {
  it("reads every vacancy of a real board", () => {
    const result = parseCleverStaffVacancies(eightAllocate);

    expect(result.ok && result.vacancies).toHaveLength(8);
    expect(result.ok && result.vacancies[0]).toEqual({
      externalId: "3ONpJV",
      title: "Business/System Analyst",
      url: "https://cleverstaff.net/i/vacancy-3ONpJV",
      location: "remote",
    });
  });

  it("reads the place of a vacancy and marks remote work", () => {
    // Поля локації - з дошки -A-HR- (19.11.2026), скорочено.
    const answer = {
      status: "ok",
      objects: [
        {
          localId: "z0i38u",
          position: "HR manager",
          workCondition: "office",
          regions: [
            { displayFullName: "Lviv, Ukraine" },
            { displayFullName: "Kyiv, Ukraine" },
          ],
        },
        {
          localId: "nd4gpz",
          position: "Analyst",
          workCondition: "remote",
          region: { displayFullName: "Kyiv, Ukraine" },
        },
      ],
    };

    const result = parseCleverStaffVacancies(answer);

    expect(
      result.ok && result.vacancies.map((vacancy) => vacancy.location),
    ).toEqual(["Lviv, Ukraine; Kyiv, Ukraine", "Kyiv, Ukraine, remote"]);
  });

  it("reads a board without vacancies", () => {
    // Справжня відповідь дошки MEV без вакансій: поля `objects` немає зовсім.
    const answer = {
      status: "ok",
      orgId: "830e6f8ba79a42469df7649c81bc6a1b",
      alias: "MEV",
      orgName: "MEV",
      publicVacanciesMap: {},
    };

    expect(parseCleverStaffVacancies(answer)).toEqual({
      ok: true,
      vacancies: [],
      skipped: 0,
    });
  });

  it("reports a board that does not exist", () => {
    expect(
      parseCleverStaffVacancies({
        status: "error",
        message: "Not found",
        code: "notFound",
      }),
    ).toEqual({ ok: false, error: { reason: "not-found" } });
  });

  it("fails on an answer it does not understand", () => {
    expect(parseCleverStaffVacancies([]).ok).toBe(false);
    expect(
      parseCleverStaffVacancies({ status: "ok", objects: [{ localId: 1 }] }).ok,
    ).toBe(false);
    expect(
      parseCleverStaffVacancies({ status: "error", code: "accountBlocked" }),
    ).toEqual({ ok: false, error: { reason: "unreadable" } });
  });
});
