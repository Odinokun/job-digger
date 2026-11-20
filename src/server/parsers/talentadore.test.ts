import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseTalentAdorePositions, talentadoreBoard } from "./talentadore.ts";

/** Справжня відповідь TalentAdore, ELK Studios (src/server/http/testing). */
const elk: unknown = JSON.parse(
  readFileSync(
    new URL(
      "../http/testing/responses/ats.talentadore.com/positions/rR1TqSR/json",
      import.meta.url,
    ),
    "utf8",
  ),
);

describe("talentadoreBoard", () => {
  it("reads the company token from the positions address", () => {
    // Сторінка ELK вбудовує віджет з цією адресою в `data-url`.
    expect(
      talentadoreBoard(
        "https://ats.talentadore.com/positions/rR1TqSR/json?v=2&language=",
      ),
    ).toBe("rR1TqSR");
    expect(
      talentadoreBoard("https://ats.talentadore.com/positions/rR1TqSR"),
    ).toBe("rR1TqSR");
  });

  it("is null where the address has no company token", () => {
    // Посилання на вакансію несе токен вакансії, а не компанії.
    expect(
      talentadoreBoard(
        "https://ats.talentadore.com/apply/2d-game-artist/ZOjKN3",
      ),
    ).toBeNull();
    expect(
      talentadoreBoard("https://ats.talentadore.com/static/ta-json-careers.js"),
    ).toBeNull();
    expect(talentadoreBoard("https://www.talentadore.com/")).toBeNull();
    expect(talentadoreBoard("https://acme.example/careers")).toBeNull();
    expect(talentadoreBoard("not a url")).toBeNull();
  });
});

describe("parseTalentAdorePositions", () => {
  it("reads every position of a real company", () => {
    const result = parseTalentAdorePositions(elk);

    expect(result).toMatchObject({ ok: true, skipped: 0 });
    if (!result.ok) return;
    expect(result.vacancies).toEqual([
      {
        externalId: "PRxEm",
        title: "Join ELK Talent Community",
        url: "https://ats.talentadore.com/apply/join-elk-talent-community/m2rx0A",
        location: null,
      },
      {
        externalId: "MlMNV",
        title: "2D Game Artist",
        url: "https://ats.talentadore.com/apply/2d-game-artist/ZOjKN3",
        // Місто й країна, а не адреса офісу з поля `location`.
        location: "Stockholm, Sweden",
      },
      {
        externalId: "Loemx",
        title: "Full Stack utvecklare",
        url: "https://ats.talentadore.com/apply/full-stack-utvecklare/ZNvp2e",
        location: "Stockholm, Sweden",
      },
    ]);
  });

  it("falls back to the office address without a city and a country", () => {
    expect(
      parseTalentAdorePositions({
        jobs: [
          {
            id: "a1",
            name: "Designer",
            link: "https://ats.talentadore.com/apply/designer/x",
            location: "Main street 1, Helsinki",
            city: "",
            country: "",
          },
        ],
      }),
    ).toMatchObject({
      ok: true,
      vacancies: [{ location: "Main street 1, Helsinki" }],
    });
  });

  it("skips a position without a name and refuses a broken one", () => {
    expect(
      parseTalentAdorePositions({
        jobs: [
          { id: "a", name: "", link: "https://ats.talentadore.com/apply/a/1" },
          {
            id: "b",
            name: "Ok",
            link: "https://ats.talentadore.com/apply/b/2",
          },
        ],
      }),
    ).toMatchObject({ ok: true, skipped: 1 });
    expect(
      parseTalentAdorePositions({ jobs: [{ id: 1, name: "Ok", link: "x" }] }),
    ).toEqual({ ok: false, error: { reason: "unreadable" } });
  });

  it("refuses an answer that is not a positions list", () => {
    // Невідомий токен - 404 з `{}`.
    expect(parseTalentAdorePositions({})).toEqual({
      ok: false,
      error: { reason: "unreadable" },
    });
  });
});
