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
    // Назви компаній не перекладаються, тому кирилиця тут така сама назва, як
    // латиниця, і викидати її не можна.
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
    // Порожня назва базу не проходить (`companies_name_not_blank`), але сюди
    // приходить недовірений ввід, тому результат має бути визначеним.
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
    // Інакше дві назви з самих розділових знаків вважалися б однією компанією.
    expect(sameCompanyName("---", "!!!")).toBe(false);
  });
});
