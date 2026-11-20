import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parsePinpointPostings, pinpointCompany } from "./pinpoint.ts";

/** Справжня відповідь `postings.json` Pinpoint, компанія GiG (src/server/http/testing). */
const gig: unknown = JSON.parse(
  readFileSync(
    new URL(
      "../http/testing/responses/gig.pinpointhq.com/postings.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

describe("pinpointCompany", () => {
  it("reads the company from the careers page and from a posting", () => {
    expect(pinpointCompany("https://gig.pinpointhq.com/")).toBe("gig");
    expect(
      pinpointCompany(
        "https://gig.pinpointhq.com/en/postings/f6d46c10-7fc0-4db6-848b-5c04e08c7e1c",
      ),
    ).toBe("gig");
    expect(pinpointCompany("https://GiG.PinpointHQ.com/#js-careers")).toBe(
      "gig",
    );
  });

  it("is null for Pinpoint's own website, app and other sites", () => {
    expect(pinpointCompany("https://www.pinpointhq.com/")).toBeNull();
    expect(pinpointCompany("https://app.pinpointhq.com/x.png")).toBeNull();
    expect(pinpointCompany("https://pinpointhq.com/")).toBeNull();
    expect(pinpointCompany("https://acme.example/careers")).toBeNull();
    expect(pinpointCompany("not a url")).toBeNull();
  });
});

describe("parsePinpointPostings", () => {
  it("reads every posting of a real careers page", () => {
    const result = parsePinpointPostings(gig);

    expect(result).toMatchObject({ ok: true, skipped: 0 });
    if (!result.ok) return;
    expect(result.vacancies).toHaveLength(16);
    expect(result.vacancies[0]).toEqual({
      externalId: "534586",
      title: "Senior DevOps Engineer",
      url: "https://gig.pinpointhq.com/en/postings/f6d46c10-7fc0-4db6-848b-5c04e08c7e1c",
      location: "St Julians, Malta",
    });
    // Місто й регіон однакові - один раз, без зайвого пробілу з даних.
    expect(result.vacancies).toContainEqual(
      expect.objectContaining({ externalId: "534599", location: "Madrid" }),
    );
  });

  it("marks a remote posting and reads one without a location", () => {
    expect(
      parsePinpointPostings({
        data: [
          {
            id: "1",
            title: "Writer",
            url: "https://acme.pinpointhq.com/en/postings/a",
            workplace_type: "remote",
            location: { city: "Kyiv", province: "Kyiv" },
          },
          {
            id: "2",
            title: "Designer",
            url: "https://acme.pinpointhq.com/en/postings/b",
            workplace_type: "remote",
            location: null,
          },
          {
            id: "3",
            title: "Editor",
            url: "https://acme.pinpointhq.com/en/postings/c",
          },
        ],
      }),
    ).toEqual({
      ok: true,
      skipped: 0,
      vacancies: [
        {
          externalId: "1",
          title: "Writer",
          url: "https://acme.pinpointhq.com/en/postings/a",
          location: "Kyiv, remote",
        },
        {
          externalId: "2",
          title: "Designer",
          url: "https://acme.pinpointhq.com/en/postings/b",
          location: "remote",
        },
        {
          externalId: "3",
          title: "Editor",
          url: "https://acme.pinpointhq.com/en/postings/c",
          location: null,
        },
      ],
    });
  });

  it("skips a posting without a title and refuses a broken one", () => {
    expect(
      parsePinpointPostings({
        data: [
          { id: "1", title: " ", url: "https://acme.pinpointhq.com/a" },
          { id: "2", title: "Ok", url: "https://acme.pinpointhq.com/b" },
        ],
      }),
    ).toMatchObject({ ok: true, skipped: 1 });
    expect(
      parsePinpointPostings({ data: [{ id: 1, title: "Ok", url: "x" }] }),
    ).toEqual({ ok: false, error: { reason: "unreadable" } });
  });

  it("refuses an answer that is not a postings list", () => {
    expect(parsePinpointPostings([])).toEqual({
      ok: false,
      error: { reason: "unreadable" },
    });
  });
});
