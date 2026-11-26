import { describe, expect, it } from "vitest";

import {
  resolveDuplicates,
  sourceKind,
  type DuplicateMatch,
} from "./duplicates.ts";

/** A match of the new vacancy `newId` with the existing `otherId` in another source of the company. */
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
    // Task 6.20: the later duplicate becomes read, whatever the existing one is -
    // even one already read.
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
    // Platforms beat sites: we show the vacancy from the platform.
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
    // The user has already seen the vacancy on the site - the new copy must not call out again.
    expect(
      resolveDuplicates("platform", [match("new", "site-1", SITE_READ)]),
    ).toEqual({ readNew: ["new"], readOthers: [] });
  });

  it("lets a platform duplicate win over an unread site one", () => {
    // The vacancy already exists on another platform: the new one is later, so it
    // is read, and the site one stays as it was.
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
    // schema.org JobPosting is read from the company's own site (task 3.11).
    expect(sourceKind("schema_org")).toBe("site");
    // A recipe page (task 6.21).
    expect(sourceKind("own_page")).toBe("site");
  });
});
