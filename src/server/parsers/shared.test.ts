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

/** Читач для тестів: запис сам каже, чим він є. */
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
    // Порожня назва чи адреса не http - вада даних однієї вакансії, а не
    // зміна формату: OpenAI на Ashby мала таку одну з 839 (18.11.2026).
    expect(collectVacancies([{ id: "1" }, { kind: "skip" }], read)).toEqual({
      ok: true,
      vacancies: [vacancy("1")],
      skipped: 1,
    });
  });

  it("fails the whole response on a record with a broken structure", () => {
    // Зламана структура - сигнал зміни формату: якби такі записи
    // пропускалися, пропущеними виявились би всі, і порожній список видалив
    // би всі вакансії джерела.
    expect(collectVacancies([{ id: "1" }, { kind: "broken" }], read)).toEqual(
      UNREADABLE,
    );
  });

  it("fails the whole response on a record that is not an object", () => {
    expect(collectVacancies([{ id: "1" }, "oops"], read)).toEqual(UNREADABLE);
    expect(collectVacancies([null], read)).toEqual(UNREADABLE);
  });

  it("fails when every record had to be skipped", () => {
    // Нуль вакансій, бо всі криві, - не «вакансій немає»: інакше вони б
    // видалилися.
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
