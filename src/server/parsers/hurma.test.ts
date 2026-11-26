import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  hurmaCompany,
  hurmaHasNextPage,
  parseHurmaVacancies,
} from "./hurma.ts";

/** A real API response of the Spribe board (src/server/http/testing). */
function saved(): unknown {
  return JSON.parse(
    readFileSync(
      new URL(
        "../http/testing/responses/spribe.hurma.work/api/v1/public-vacancies",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}

/** An API response with these vacancies and no next page. */
function answer(data: unknown[], next: string | null = null) {
  return { data, links: { next }, meta: { per_page: 100 } };
}

describe("hurmaCompany", () => {
  it("reads the company from the board and from a vacancy", () => {
    expect(hurmaCompany("https://spribe.hurma.work/public-vacancies")).toBe(
      "spribe",
    );
    expect(hurmaCompany("https://Spribe.hurma.work/public-vacancies/72")).toBe(
      "spribe",
    );
    expect(hurmaCompany("https://talents-boutique.hurma.work/")).toBe(
      "talents-boutique",
    );
  });

  it("is null for Hurma's own services and for other sites", () => {
    expect(hurmaCompany("https://academy.hurma.work/hr-club")).toBeNull();
    expect(hurmaCompany("https://support.hurma.work/en")).toBeNull();
    expect(hurmaCompany("https://www.hurma.work/")).toBeNull();
    expect(hurmaCompany("https://hurma.work/")).toBeNull();
    expect(hurmaCompany("https://a.b.hurma.work/")).toBeNull();
    expect(hurmaCompany("https://acme.example/careers")).toBeNull();
    expect(hurmaCompany("not a url")).toBeNull();
  });
});

describe("parseHurmaVacancies", () => {
  it("reads every vacancy of a real board", () => {
    const result = parseHurmaVacancies(saved());

    expect(result.ok && result.skipped).toBe(0);
    expect(result.ok && result.vacancies).toHaveLength(6);
    expect(result.ok && result.vacancies[0]).toEqual({
      externalId: "243",
      title: "Head of Business Development (Broadway Platform)",
      url: "https://spribe.hurma.work/public-vacancies/243",
      location: null,
    });
    expect(result.ok && result.vacancies[3]?.location).toBe("Remote");
    expect(result.ok && result.vacancies[4]?.location).toBe("Tbilisi, Georgia");
  });

  it("joins the place and the work format and splits places on bars", () => {
    const result = parseHurmaVacancies(
      answer([
        {
          name: "Account Manager",
          public_url: "https://acme.hurma.work/public-vacancies/459",
          residence: "Milton Keynes|UK",
          work_format: "Remote, In the office/On site",
        },
      ]),
    );

    expect(result.ok && result.vacancies[0]?.location).toBe(
      "Milton Keynes, UK, Remote, In the office/On site",
    );
  });

  it("reads an empty board", () => {
    expect(parseHurmaVacancies(answer([]))).toEqual({
      ok: true,
      vacancies: [],
      skipped: 0,
    });
  });

  it("skips a vacancy with an empty title", () => {
    const result = parseHurmaVacancies(
      answer([
        { name: " ", public_url: "https://acme.hurma.work/public-vacancies/1" },
        {
          name: "QA",
          public_url: "https://acme.hurma.work/public-vacancies/2",
        },
      ]),
    );

    expect(result).toEqual({
      ok: true,
      skipped: 1,
      vacancies: [
        {
          externalId: "2",
          title: "QA",
          url: "https://acme.hurma.work/public-vacancies/2",
          location: null,
        },
      ],
    });
  });

  it("fails on an answer that is not a list of vacancies", () => {
    expect(parseHurmaVacancies([]).ok).toBe(false);
    expect(parseHurmaVacancies({ message: "" }).ok).toBe(false);
    expect(parseHurmaVacancies(answer([{ name: "QA" }])).ok).toBe(false);
    // An address without an ID means the format changed, not bad data in one vacancy.
    expect(
      parseHurmaVacancies(
        answer([{ name: "QA", public_url: "https://acme.hurma.work/jobs/qa" }]),
      ).ok,
    ).toBe(false);
  });
});

describe("hurmaHasNextPage", () => {
  it("follows the next link of the answer", () => {
    expect(
      hurmaHasNextPage(answer([], "https://acme.hurma.work/api?page=2")),
    ).toBe(true);
    expect(hurmaHasNextPage(answer([]))).toBe(false);
    expect(hurmaHasNextPage(saved())).toBe(false);
    expect(hurmaHasNextPage({})).toBe(false);
  });
});
