import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  isPeopleForcePage,
  parsePeopleForcePage,
  peopleforceSite,
} from "./peopleforce.ts";

/** A real PeopleForce career page (src/server/http/testing). */
function saved(host: string): string {
  return readFileSync(
    new URL(`../http/testing/responses/${host}/careers`, import.meta.url),
    "utf8",
  );
}

/** PeopleForce itself: 6 vacancies, one page. */
const team = saved("team.peopleforce.io");
/** Webellian: the first page of three, 10 vacancies of 23. */
const webellian = saved("webellian.peopleforce.io");
/** SoftConstruct: PeopleForce on the company's domain, 10 vacancies of 215 (task 5.13). */
const softconstruct = saved("peopleforce.softconstruct.com");

const TEAM_PAGE = "https://team.peopleforce.io/careers?page=1";

/**
 * A list in PeopleForce markup: the "X - Y of N" counter (the text around the
 * numbers is translated, the numbers are not) and vacancy cards. Without a
 * counter it is an empty list, as on a real page ("There are currently no vacancies.").
 */
function page({
  counter,
  cards,
}: {
  counter?: [string, string];
  cards: string[];
}): string {
  const counterHtml =
    counter === undefined
      ? `<div>There are currently no vacancies.</div>`
      : `<div>Displaying <strong>${counter[0]}</strong> of <strong>${counter[1]}</strong> in total</div>`;
  return `<!doctype html><html><body><div id="results">${counterHtml}<div>${cards.join("")}</div></div></body></html>`;
}

function card(href: string, title: string, location?: string): string {
  const place =
    location === undefined
      ? ""
      : `<div><i class="fas fa-map-marker-alt"></i>${location}</div>`;

  return `<div class="tw-p-4"><h4><a href="${href}">${title}</a></h4><div><div><i class="fas fa-briefcase"></i>Product</div>${place}</div></div>`;
}

const UNREADABLE = { ok: false, error: { reason: "unreadable" } };

describe("peopleforceSite", () => {
  it("takes the career site of a company from its address", () => {
    expect(peopleforceSite("https://team.peopleforce.io/careers")).toBe(
      "https://team.peopleforce.io",
    );
    expect(
      peopleforceSite(
        "https://webellian.peopleforce.io/careers/v/229682-future-opportunities-internships",
      ),
    ).toBe("https://webellian.peopleforce.io");
    expect(peopleforceSite("https://team.peopleforce.io")).toBe(
      "https://team.peopleforce.io",
    );
  });

  it("finds no career site where there is none", () => {
    expect(peopleforceSite("https://peopleforce.io/careers")).toBeNull();
    expect(peopleforceSite("https://www.peopleforce.io/careers")).toBeNull();
    expect(peopleforceSite("https://a.b.peopleforce.io/careers")).toBeNull();
    expect(peopleforceSite("https://jobs.lever.co/team")).toBeNull();
    expect(peopleforceSite("not an address")).toBeNull();
  });
});

describe("isPeopleForcePage", () => {
  it("recognises a real PeopleForce career page on any address", () => {
    expect(isPeopleForcePage(team)).toBe(true);
    expect(isPeopleForcePage(webellian)).toBe(true);
    expect(isPeopleForcePage(softconstruct)).toBe(true);
  });

  it("does not take a job list without the PeopleForce credit for one", () => {
    expect(isPeopleForcePage(page({ cards: [] }))).toBe(false);
  });

  it("does not take a page that only links to PeopleForce for one", () => {
    expect(
      isPeopleForcePage(
        `<html><body><div class="credit">Powered by <a href="https://peopleforce.io">PeopleForce</a></div></body></html>`,
      ),
    ).toBe(false);
    expect(
      isPeopleForcePage(
        `<html><body><div id="results"></div><a href="https://peopleforce.io">HR software</a></body></html>`,
      ),
    ).toBe(false);
  });
});

describe("parsePeopleForcePage", () => {
  it("reads every job of a real one-page list", () => {
    const result = parsePeopleForcePage(team, TEAM_PAGE);

    expect(result.ok && result.vacancies).toHaveLength(6);
    expect(result.ok && result.hasNext).toBe(false);
    expect(result.ok && result.vacancies[0]).toEqual({
      externalId: "253193",
      title: "Integration Engineer, Polish ERP Connectors",
      url: "https://team.peopleforce.io/careers/v/253193-integration-engineer-polish-erp-connectors",
      location: "Poland",
    });
  });

  it("reads a real list on the company's own domain", () => {
    const result = parsePeopleForcePage(
      softconstruct,
      "https://peopleforce.softconstruct.com/careers?page=1",
    );

    expect(result.ok && result.vacancies).toHaveLength(10);
    expect(result.ok && result.hasNext).toBe(true);
    expect(result.ok && result.vacancies[0]?.url).toMatch(
      /^https:\/\/peopleforce\.softconstruct\.com\/careers\/v\/\d+/,
    );
  });

  it("sees the next page of a real paged list", () => {
    const result = parsePeopleForcePage(
      webellian,
      "https://webellian.peopleforce.io/careers?page=1",
    );

    expect(result.ok && result.vacancies).toHaveLength(10);
    expect(result.ok && result.hasNext).toBe(true);
  });

  it("leaves the location empty when a job has none", () => {
    const result = parsePeopleForcePage(
      page({ counter: ["1 - 1", "1"], cards: [card("/careers/v/7-a", "A")] }),
      TEAM_PAGE,
    );

    expect(result.ok && result.vacancies[0]?.location).toBeNull();
  });

  it("reads a list without a counter and jobs as no jobs", () => {
    expect(parsePeopleForcePage(page({ cards: [] }), TEAM_PAGE)).toEqual({
      ok: true,
      vacancies: [],
      skipped: 0,
      hasNext: false,
    });
  });

  it("skips a job without a title and counts it", () => {
    const result = parsePeopleForcePage(
      page({
        counter: ["1 - 2", "2"],
        cards: [card("/careers/v/7-a", "A"), card("/careers/v/8-b", "  ")],
      }),
      TEAM_PAGE,
    );

    expect(result.ok && result.vacancies).toHaveLength(1);
    expect(result.ok && result.skipped).toBe(1);
  });

  it("fails when the jobs do not match the counter", () => {
    // The markup changed so that some cards are not visible - zero or half of
    // the vacancies would delete the rest.
    expect(
      parsePeopleForcePage(
        page({ counter: ["1 - 2", "2"], cards: [card("/careers/v/7-a", "A")] }),
        TEAM_PAGE,
      ),
    ).toEqual(UNREADABLE);
    expect(
      parsePeopleForcePage(
        page({ counter: ["1 - 1", "1"], cards: [] }),
        TEAM_PAGE,
      ),
    ).toEqual(UNREADABLE);
  });

  it("fails on jobs without a counter or a counter it cannot read", () => {
    expect(
      parsePeopleForcePage(
        page({ cards: [card("/careers/v/7-a", "A")] }),
        TEAM_PAGE,
      ),
    ).toEqual(UNREADABLE);
    expect(
      parsePeopleForcePage(
        page({ counter: ["all", "1"], cards: [card("/careers/v/7-a", "A")] }),
        TEAM_PAGE,
      ),
    ).toEqual(UNREADABLE);
  });

  it("fails the whole page when a job link is not a vacancy", () => {
    expect(
      parsePeopleForcePage(
        page({
          counter: ["1 - 2", "2"],
          cards: [card("/careers/v/7-a", "A"), card("/careers/apply", "B")],
        }),
        TEAM_PAGE,
      ),
    ).toEqual(UNREADABLE);
  });

  it("fails on a counter that ends past its own total", () => {
    expect(
      parsePeopleForcePage(
        page({
          counter: ["1 - 2", "1"],
          cards: [card("/careers/v/1-a", "A"), card("/careers/v/2-b", "B")],
        }),
        TEAM_PAGE,
      ),
    ).toEqual(UNREADABLE);
  });

  it("fails on a page that is not a PeopleForce job list", () => {
    expect(
      parsePeopleForcePage("<html><body>Hello</body></html>", TEAM_PAGE),
    ).toEqual(UNREADABLE);
  });
});
