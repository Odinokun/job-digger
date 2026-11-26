import { describe, expect, it } from "vitest";

import { collectVacancies, type ReadVacancy } from "./shared.ts";
import type { ParsedVacancy } from "./types.ts";

const UNREADABLE = { ok: false, error: { reason: "unreadable" } };

function vacancy(id: string): ParsedVacancy {
  return {
    externalId: id,
    title: `Job ${id}`,
    url: `https://example.com/jobs/${id}`,
    location: null,
  };
}

/** A reader for tests: the record itself says what it is. */
const read: ReadVacancy = (item) =>
  item.kind === "skip"
    ? "skip"
    : item.kind === "broken"
      ? "broken"
      : vacancy(String(item.id));

describe("collectVacancies", () => {
  it("collects every good record", () => {
    expect(collectVacancies([{ id: "1" }, { id: "2" }], read)).toEqual({
      ok: true,
      vacancies: [vacancy("1"), vacancy("2")],
      skipped: 0,
    });
  });

  it("skips a record with bad data and counts it", () => {
    // An empty title or a non-http address is bad data in one vacancy, not a
    // format change: OpenAI on Ashby had one such of 839 (18.11.2026).
    expect(collectVacancies([{ id: "1" }, { kind: "skip" }], read)).toEqual({
      ok: true,
      vacancies: [vacancy("1")],
      skipped: 1,
    });
  });

  it("fails the whole response on a record with a broken structure", () => {
    // A broken structure signals a format change: if such records were skipped,
    // all of them would be, and an empty list would delete all the source's
    // vacancies.
    expect(collectVacancies([{ id: "1" }, { kind: "broken" }], read)).toEqual(
      UNREADABLE,
    );
  });

  it("fails the whole response on a record that is not an object", () => {
    expect(collectVacancies([{ id: "1" }, "oops"], read)).toEqual(UNREADABLE);
    expect(collectVacancies([null], read)).toEqual(UNREADABLE);
  });

  it("fails when every record had to be skipped", () => {
    // Zero vacancies because all are broken is not "there are no vacancies":
    // otherwise they would be deleted.
    expect(
      collectVacancies([{ kind: "skip" }, { kind: "skip" }], read),
    ).toEqual(UNREADABLE);
  });

  it("reads an empty list as no vacancies", () => {
    expect(collectVacancies([], read)).toEqual({
      ok: true,
      vacancies: [],
      skipped: 0,
    });
  });
});
