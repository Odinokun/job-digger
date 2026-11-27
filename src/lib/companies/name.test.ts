import { describe, expect, it } from "vitest";

import { normalizeCompanyName, sameCompanyName } from "./name.ts";

describe("normalizeCompanyName", () => {
  it("ignores case", () => {
    expect(normalizeCompanyName("Linear")).toBe(normalizeCompanyName("linear"));
  });

  it("ignores spaces and hyphens", () => {
    const expected = "rollsroyce";

    expect(normalizeCompanyName("Rolls-Royce")).toBe(expected);
    expect(normalizeCompanyName("Rolls Royce")).toBe(expected);
    expect(normalizeCompanyName("RollsRoyce")).toBe(expected);
    expect(normalizeCompanyName("rollsRoyce")).toBe(expected);
    expect(normalizeCompanyName("  rolls royce  ")).toBe(expected);
  });

  it("keeps letters of any alphabet", () => {
    // Company names are not translated, so Cyrillic is as much a name here as Latin,
    // and it must not be thrown away.
    expect(normalizeCompanyName("Нова Пошта")).toBe("новапошта");
  });

  it("keeps digits", () => {
    expect(normalizeCompanyName("Studio 21")).toBe("studio21");
  });

  it("drops punctuation around the name", () => {
    expect(normalizeCompanyName("Ernst & Young")).toBe("ernstyoung");
    expect(normalizeCompanyName("Yahoo!")).toBe("yahoo");
  });

  it("gives an empty string for a name made of punctuation alone", () => {
    // An empty name does not pass the database (`companies_name_not_blank`), but
    // untrusted input arrives here, so the result has to be defined.
    expect(normalizeCompanyName(" --- ")).toBe("");
  });
});

describe("sameCompanyName", () => {
  it("treats differently written forms as one company", () => {
    expect(sameCompanyName("Rolls-Royce", "rolls royce")).toBe(true);
  });

  it("keeps different names apart", () => {
    expect(sameCompanyName("Linear", "Linear Inc")).toBe(false);
  });

  it("never matches two empty names", () => {
    // Otherwise two names made only of punctuation would count as one company.
    expect(sameCompanyName("---", "!!!")).toBe(false);
  });
});
