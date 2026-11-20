import { describe, expect, it } from "vitest";

import {
  resolveDuplicates,
  sourceKind,
  type DuplicateMatch,
} from "./duplicates.ts";

/** Збіг нової вакансії `newId` з наявною `otherId` в іншому джерелі компанії. */
function match(
  newId: string,
  otherId: string,
  other: Pick<DuplicateMatch, "otherKind" | "otherIsRead">,
): DuplicateMatch {
  return { newId, otherId, ...other };
}

const PLATFORM_UNREAD = { otherKind: "platform", otherIsRead: false } as const;
const PLATFORM_READ = { otherKind: "platform", otherIsRead: true } as const;
const SITE_UNREAD = { otherKind: "site", otherIsRead: false } as const;
const SITE_READ = { otherKind: "site", otherIsRead: true } as const;

describe("resolveDuplicates", () => {
  it("leaves a vacancy without duplicates alone", () => {
    expect(resolveDuplicates("platform", [])).toEqual({
      readNew: [],
      readOthers: [],
    });
  });

  it("marks a later platform duplicate of a platform vacancy as read", () => {
    // Задача 6.20: пізніший дублікат стає прочитаним, хоч би яким був
    // наявний - навіть уже прочитаним.
    expect(
      resolveDuplicates("platform", [match("new", "old", PLATFORM_UNREAD)]),
    ).toEqual({ readNew: ["new"], readOthers: [] });
    expect(
      resolveDuplicates("platform", [match("new", "old", PLATFORM_READ)]),
    ).toEqual({ readNew: ["new"], readOthers: [] });
  });

  it("marks a site duplicate as read whatever it duplicates", () => {
    expect(
      resolveDuplicates("site", [match("new", "old", SITE_UNREAD)]),
    ).toEqual({ readNew: ["new"], readOthers: [] });
    expect(
      resolveDuplicates("site", [match("new", "old", PLATFORM_READ)]),
    ).toEqual({ readNew: ["new"], readOthers: [] });
  });

  it("keeps a platform vacancy unread and reads its unread site duplicate", () => {
    // Платформи мають перевагу над сайтами: показуємо вакансію з платформи.
    expect(
      resolveDuplicates("platform", [match("new", "site-1", SITE_UNREAD)]),
    ).toEqual({ readNew: [], readOthers: ["site-1"] });
  });

  it("reads every unread site duplicate, but not the read ones", () => {
    expect(
      resolveDuplicates("platform", [
        match("new", "site-1", SITE_UNREAD),
        match("new", "site-2", SITE_READ),
        match("new", "site-3", SITE_UNREAD),
      ]),
    ).toEqual({ readNew: [], readOthers: ["site-1", "site-3"] });
  });

  it("reads a platform vacancy whose site duplicates were all read already", () => {
    // Людина вже бачила вакансію на сайті - нова копія не має знову кликати.
    expect(
      resolveDuplicates("platform", [match("new", "site-1", SITE_READ)]),
    ).toEqual({ readNew: ["new"], readOthers: [] });
  });

  it("lets a platform duplicate win over an unread site one", () => {
    // Вакансія вже є на іншій платформі: нова пізніша, тож прочитана, а
    // сайтова лишається як була.
    expect(
      resolveDuplicates("platform", [
        match("new", "site-1", SITE_UNREAD),
        match("new", "other-platform", PLATFORM_UNREAD),
      ]),
    ).toEqual({ readNew: ["new"], readOthers: [] });
  });

  it("decides for each new vacancy on its own", () => {
    expect(
      resolveDuplicates("platform", [
        match("a", "site-1", SITE_UNREAD),
        match("b", "old", PLATFORM_READ),
      ]),
    ).toEqual({ readNew: ["b"], readOthers: ["site-1"] });
  });
});

describe("sourceKind", () => {
  it("calls a parsed platform a platform", () => {
    expect(sourceKind("peopleforce")).toBe("platform");
    expect(sourceKind("greenhouse")).toBe("platform");
  });

  it("calls the company's own page a site", () => {
    // schema.org JobPosting читається з власного сайту компанії (задача 3.11).
    expect(sourceKind("schema_org")).toBe("site");
  });
});
