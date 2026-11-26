import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseWorkableWidget, workableAccount } from "./workable.ts";

/** A real Workable widget response, the GoReel account (src/server/http/testing). */
const goreel: unknown = JSON.parse(
  readFileSync(
    new URL(
      "../http/testing/responses/apply.workable.com/api/v1/widget/accounts/goreel",
      import.meta.url,
    ),
    "utf8",
  ),
);

describe("workableAccount", () => {
  it("reads the account from the careers page and from a job of it", () => {
    expect(workableAccount("https://apply.workable.com/goreel/")).toBe(
      "goreel",
    );
    expect(workableAccount("https://apply.workable.com/goreel")).toBe("goreel");
    expect(
      workableAccount("https://apply.workable.com/goreel/j/CABF5A6E3A/"),
    ).toBe("goreel");
    expect(workableAccount("https://Apply.Workable.com/GoReel/")).toBe(
      "goreel",
    );
  });

  it("reads the account from the old subdomain careers page", () => {
    expect(workableAccount("https://goreel.workable.com/")).toBe("goreel");
    expect(workableAccount("https://goreel.workable.com/jobs/123")).toBe(
      "goreel",
    );
  });

  it("is null where the address says nothing about the account", () => {
    // A short vacancy link has no account.
    expect(
      workableAccount("https://apply.workable.com/j/CABF5A6E3A"),
    ).toBeNull();
    expect(workableAccount("https://apply.workable.com/api/v1/x")).toBeNull();
    expect(workableAccount("https://apply.workable.com/")).toBeNull();
    // Workable's own site and app.
    expect(workableAccount("https://www.workable.com/careers")).toBeNull();
    expect(workableAccount("https://workable.com/")).toBeNull();
    expect(workableAccount("https://acme.example/careers")).toBeNull();
    expect(workableAccount("not a url")).toBeNull();
  });
});

describe("parseWorkableWidget", () => {
  it("reads every job of a real account", () => {
    const result = parseWorkableWidget(goreel);

    expect(result).toMatchObject({ ok: true, skipped: 0 });
    if (!result.ok) return;
    expect(result.vacancies).toHaveLength(3);
    expect(result.vacancies[0]).toEqual({
      externalId: "CABF5A6E3A",
      title: "Senior Automation QA Engineer (Python)",
      url: "https://apply.workable.com/j/CABF5A6E3A",
      // `telecommuting: true` means remote.
      location: "Bratislava, Slovakia, remote",
    });
  });

  it("reads a job without a city or remote work", () => {
    const result = parseWorkableWidget({
      name: "Acme",
      jobs: [
        {
          title: "Designer",
          shortcode: "AB12",
          url: "https://apply.workable.com/j/AB12",
          telecommuting: false,
          country: "Ukraine",
          city: "",
        },
        {
          title: "Writer",
          shortcode: "CD34",
          url: "https://apply.workable.com/j/CD34",
          telecommuting: false,
        },
      ],
    });

    expect(result).toEqual({
      ok: true,
      skipped: 0,
      vacancies: [
        {
          externalId: "AB12",
          title: "Designer",
          url: "https://apply.workable.com/j/AB12",
          location: "Ukraine",
        },
        {
          externalId: "CD34",
          title: "Writer",
          url: "https://apply.workable.com/j/CD34",
          location: null,
        },
      ],
    });
  });

  it("reads an account without jobs as no vacancies", () => {
    expect(parseWorkableWidget({ name: "Acme", jobs: [] })).toEqual({
      ok: true,
      vacancies: [],
      skipped: 0,
    });
  });

  it("skips a job without a title and refuses a broken one", () => {
    expect(
      parseWorkableWidget({
        jobs: [
          { title: " ", shortcode: "A", url: "https://apply.workable.com/j/A" },
          {
            title: "Ok",
            shortcode: "B",
            url: "https://apply.workable.com/j/B",
          },
        ],
      }),
    ).toMatchObject({ ok: true, skipped: 1 });
    expect(
      parseWorkableWidget({ jobs: [{ title: 42, shortcode: "A", url: "x" }] }),
    ).toEqual({ ok: false, error: { reason: "unreadable" } });
  });

  it("refuses an answer that is not a widget", () => {
    expect(parseWorkableWidget([])).toEqual({
      ok: false,
      error: { reason: "unreadable" },
    });
    expect(parseWorkableWidget({ name: "Acme" })).toEqual({
      ok: false,
      error: { reason: "unreadable" },
    });
  });
});
