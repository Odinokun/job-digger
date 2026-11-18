import { describe, expect, it } from "vitest";

import { MARK_ALL_BATCH, parseVacancyIds, toBatches } from "./mark-all.ts";

const ID = "d3bc1ced-3ce4-4086-a050-555055dbb1ff";

describe("toBatches", () => {
  it("splits a snapshot into requests that fit the action body limit", () => {
    const ids = Array.from({ length: MARK_ALL_BATCH * 2 + 1 }, () => ID);

    expect(toBatches(ids).map((batch) => batch.length)).toEqual([
      MARK_ALL_BATCH,
      MARK_ALL_BATCH,
      1,
    ]);
  });

  it("gives no batches for an empty snapshot", () => {
    expect(toBatches([])).toEqual([]);
  });
});

describe("parseVacancyIds", () => {
  it("accepts a list of strings no longer than one batch", () => {
    expect(parseVacancyIds([ID, "x"])).toEqual([ID, "x"]);
    expect(parseVacancyIds([])).toEqual([]);
  });

  it("refuses anything else", () => {
    expect(parseVacancyIds(ID)).toBeNull();
    expect(parseVacancyIds([ID, 1])).toBeNull();
    expect(parseVacancyIds(null)).toBeNull();
    expect(
      parseVacancyIds(Array.from({ length: MARK_ALL_BATCH + 1 }, () => ID)),
    ).toBeNull();
  });
});
