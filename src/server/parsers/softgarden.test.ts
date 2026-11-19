import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  parseSoftgardenBoard,
  parseSoftgardenFeed,
  softgardenSource,
} from "./softgarden.ts";

/** Справжня відповідь softgarden (src/server/http/testing). */
function saved(path: string): string {
  return readFileSync(
    new URL(`../http/testing/responses/${path}`, import.meta.url),
    "utf8",
  );
}

const BOARD_PAGE = "https://acme.softgarden.io/en/vacancies";

/**
 * Сторінка старої дошки з такими картками й ID у даних мапи - як справжня:
 * шапка списку, `SG.allJobLocations` і по `push` на кожну локацію.
 */
function board(cards: string, postingIds: number[] = []): string {
  const pushes = postingIds
    .map((id) => `SG.allJobLocations.push({postingId: ${id}});`)
    .join("");

  return `<html><body><div class="matchElement matchHeadline"><div id="matchValueHeadline1">Vacancy</div></div>${cards}<script>SG.allJobLocations = [];${pushes}</script></body></html>`;
}

function card(id: number, title: string, places: string[] = []): string {
  const locations = places
    .map((place) => `<span class="location-view-item">${place}</span>`)
    .join("");

  return `<div class="matchElement" id="job_id_${id}"><div class="matchValue title"><a href="../job/${id}/slug?jobDbPVId=1&amp;l=en">${title}</a></div><div class="matchValue ProjectGeoLocationCity">${locations}</div></div>`;
}

describe("softgardenSource", () => {
  it("reads an old board from the board, its root and a job", () => {
    const old = { kind: "board", origin: "https://acme.softgarden.io" };

    expect(softgardenSource("https://acme.softgarden.io/en/vacancies")).toEqual(
      old,
    );
    expect(softgardenSource("https://Acme.softgarden.io/")).toEqual(old);
    expect(
      softgardenSource("https://acme.softgarden.io/job/17623206/x?l=en"),
    ).toEqual(old);
  });

  it("reads a career site from its pages and its feed", () => {
    const site = { kind: "site", origin: "https://acme.career.softgarden.de" };

    expect(softgardenSource("https://acme.career.softgarden.de/en/")).toEqual(
      site,
    );
    expect(
      softgardenSource("https://acme.career.softgarden.de/jobs/29892564/x/"),
    ).toEqual(site);
  });

  it("is null for softgarden's own sites and for other sites", () => {
    expect(softgardenSource("https://www.softgarden.io/")).toBeNull();
    expect(softgardenSource("https://softgarden.io/")).toBeNull();
    expect(softgardenSource("https://api.softgarden.io/api/rest")).toBeNull();
    expect(softgardenSource("https://static.softgarden.de/x.js")).toBeNull();
    expect(softgardenSource("https://a.b.softgarden.io/")).toBeNull();
    expect(softgardenSource("https://acme.example/careers")).toBeNull();
    expect(softgardenSource("not a url")).toBeNull();
  });
});

describe("parseSoftgardenBoard", () => {
  it("reads every job of a real board", () => {
    const result = parseSoftgardenBoard(
      saved("dps.softgarden.io/en/vacancies"),
      "https://dps.softgarden.io/en/vacancies",
    );

    expect(result.ok && result.skipped).toBe(0);
    expect(result.ok && result.vacancies).toHaveLength(19);
    expect(result.ok && result.vacancies[0]).toEqual({
      externalId: "63432734",
      title: "Java Developer (m/w/d)",
      url: "https://dps.softgarden.io/job/63432734/Java-Developer-m-w-d-",
      location: "Hamburg",
    });
    expect(result.ok && result.vacancies[1]?.location).toBe(
      "Deutschland, Hamburg, Stuttgart, Frankfurt am Main",
    );
  });

  it("reads a board without jobs", () => {
    expect(parseSoftgardenBoard(board(""), BOARD_PAGE)).toEqual({
      ok: true,
      vacancies: [],
      skipped: 0,
    });
  });

  it("skips a job with an empty title and leaves no location as null", () => {
    const result = parseSoftgardenBoard(
      board(card(1, " ") + card(2, "QA"), [1, 2]),
      BOARD_PAGE,
    );

    expect(result).toEqual({
      ok: true,
      skipped: 1,
      vacancies: [
        {
          externalId: "2",
          title: "QA",
          url: "https://acme.softgarden.io/job/2/slug",
          location: null,
        },
      ],
    });
  });

  it("fails when the map knows a job the list does not show", () => {
    // Змінена верстка: картки не знайшлися, а дані мапи - є.
    expect(parseSoftgardenBoard(board("", [1]), BOARD_PAGE).ok).toBe(false);
    expect(
      parseSoftgardenBoard(board(card(1, "QA"), [1, 2]), BOARD_PAGE).ok,
    ).toBe(false);
  });

  it("fails on a page that is not a softgarden board", () => {
    expect(
      parseSoftgardenBoard("<html><body>Jobs</body></html>", BOARD_PAGE).ok,
    ).toBe(false);
    expect(
      parseSoftgardenBoard(
        board('<div class="matchElement" id="job_id_1"></div>', [1]),
        BOARD_PAGE,
      ).ok,
    ).toBe(false);
  });
});

describe("parseSoftgardenFeed", () => {
  it("reads every job of a real feed", () => {
    const result = parseSoftgardenFeed(
      JSON.parse(saved("spinncloud.career.softgarden.de/jobs.feed.json")),
    );

    expect(result.ok && result.skipped).toBe(0);
    expect(result.ok && result.vacancies).toHaveLength(6);
    expect(result.ok && result.vacancies[0]).toEqual({
      externalId: "29892564",
      title: "Embedded Machine Learning Engineer",
      url: "https://spinncloud.career.softgarden.de/jobs/29892564/Embedded-Machine-Learning-Engineer/",
      location: "Dresden, Deutschland",
    });
    // Порожні частини адреси softgarden заповнює «-».
    expect(result.ok && result.vacancies[5]?.location).toBe("Germany");
  });

  it("joins several places of a job", () => {
    const result = parseSoftgardenFeed(
      feed([
        item(7, "QA", [
          { addressLocality: "Hamburg", addressCountry: "Deutschland" },
          { addressRegion: "Bayern", addressCountry: "Deutschland" },
        ]),
      ]),
    );

    expect(result.ok && result.vacancies[0]?.location).toBe(
      "Hamburg, Deutschland; Bayern, Deutschland",
    );
  });

  it("reads an empty feed", () => {
    expect(parseSoftgardenFeed(feed([]))).toEqual({
      ok: true,
      vacancies: [],
      skipped: 0,
    });
  });

  it("fails on an answer that is not a whole job feed", () => {
    expect(parseSoftgardenFeed([]).ok).toBe(false);
    expect(parseSoftgardenFeed({ success: false }).ok).toBe(false);
    // Фід каже, що вакансій більше, ніж у ньому є.
    expect(
      parseSoftgardenFeed({ ...feed([item(7, "QA")]), numberOfItems: 2 }).ok,
    ).toBe(false);
    expect(parseSoftgardenFeed(feed([{ item: { title: "QA" } }])).ok).toBe(
      false,
    );
  });
});

/** Фід нового кар'єрного сайту з такими записами. */
function feed(elements: unknown[]) {
  return {
    "@type": "DataFeed",
    numberOfItems: elements.length,
    dataFeedElement: elements,
  };
}

function item(id: number, title: string, addresses: object[] = []) {
  return {
    "@type": "DataFeedItem",
    item: {
      "@type": "JobPosting",
      title,
      url: `https://acme.career.softgarden.de/jobs/${id}/slug/`,
      identifier: { "@type": "PropertyValue", value: id },
      jobLocation: addresses.map((address) => ({ "@type": "Place", address })),
    },
  };
}
