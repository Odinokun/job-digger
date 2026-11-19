import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parsePersonioFeed, personioBoard } from "./personio.ts";

/** Справжній XML-фід дошки Astrafy (src/server/http/testing). */
function saved(): string {
  return readFileSync(
    new URL(
      "../http/testing/responses/astrafy.jobs.personio.de/xml",
      import.meta.url,
    ),
    "utf8",
  );
}

const BOARD = "https://acme.jobs.personio.de";

/** Фід з такими позиціями. */
function feed(positions: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<workzag-jobs>${positions}</workzag-jobs>`;
}

describe("personioBoard", () => {
  it("reads the board from the board, the feed and a job", () => {
    expect(personioBoard("https://acme.jobs.personio.de")).toBe(BOARD);
    expect(
      personioBoard("https://Acme.jobs.personio.de/job/2888194?language=de"),
    ).toBe(BOARD);
    expect(personioBoard("https://acme.jobs.personio.com/xml")).toBe(
      "https://acme.jobs.personio.com",
    );
  });

  it("is null for Personio's own sites and for other sites", () => {
    expect(personioBoard("https://www.jobs.personio.de/")).toBeNull();
    expect(personioBoard("https://jobs.personio.de/")).toBeNull();
    expect(personioBoard("https://www.personio.com/careers")).toBeNull();
    expect(personioBoard("https://a.b.jobs.personio.de/")).toBeNull();
    expect(personioBoard("https://acme.example/careers")).toBeNull();
    expect(personioBoard("not a url")).toBeNull();
  });
});

describe("parsePersonioFeed", () => {
  it("reads every position of a real feed", () => {
    const result = parsePersonioFeed(
      saved(),
      "https://astrafy.jobs.personio.de",
    );

    expect(result).toEqual({
      ok: true,
      skipped: 0,
      vacancies: [
        {
          externalId: "2888194",
          title: "Analytics Engineer – Power BI & Microsoft Fabric",
          url: "https://astrafy.jobs.personio.de/job/2888194",
          location: "Madrid",
        },
        {
          externalId: "738990",
          title: "Internship - Data Engineer",
          url: "https://astrafy.jobs.personio.de/job/738990",
          location: "Madrid (Hybrid)",
        },
        {
          externalId: "2124624",
          title: "Looker Engineer / BI Engineer",
          url: "https://astrafy.jobs.personio.de/job/2124624",
          location: "Geneva, Madrid (Remote)",
        },
        {
          externalId: "2180291",
          title: "Senior Data Engineer",
          url: "https://astrafy.jobs.personio.de/job/2180291",
          location: "Madrid (Hybrid), Madrid (Remote)",
        },
      ],
    });
  });

  it("reads an empty feed", () => {
    expect(parsePersonioFeed(feed(""), BOARD)).toEqual({
      ok: true,
      vacancies: [],
      skipped: 0,
    });
  });

  it("skips a position with an empty title and leaves no office as null", () => {
    const result = parsePersonioFeed(
      feed(
        "<position><id>1</id><name> </name></position>" +
          "<position><id>2</id><name>QA</name></position>",
      ),
      BOARD,
    );

    expect(result).toEqual({
      ok: true,
      skipped: 1,
      vacancies: [
        {
          externalId: "2",
          title: "QA",
          url: "https://acme.jobs.personio.de/job/2",
          location: null,
        },
      ],
    });
  });

  it("fails on an answer that is not a Personio feed", () => {
    expect(parsePersonioFeed("<html><body>Jobs</body></html>", BOARD).ok).toBe(
      false,
    );
    expect(parsePersonioFeed("", BOARD).ok).toBe(false);
    expect(
      parsePersonioFeed(feed("<position><name>QA</name></position>"), BOARD).ok,
    ).toBe(false);
    expect(
      parsePersonioFeed(
        feed("<position><id>x1</id><name>QA</name></position>"),
        BOARD,
      ).ok,
    ).toBe(false);
    expect(
      parsePersonioFeed(feed("<position><id>1</id></position>"), BOARD).ok,
    ).toBe(false);
  });
});
