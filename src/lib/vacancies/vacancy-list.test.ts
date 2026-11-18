import { describe, expect, it } from "vitest";

import {
  belongsToJobsTab,
  parseJobsTab,
  patchVacancy,
  type VacancyListItem,
} from "./vacancy-list";

function vacancy(
  marks: Pick<VacancyListItem, "isRead" | "isFavorite" | "closedAt">,
): VacancyListItem {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Designer",
    url: "https://example.com/jobs/1",
    location: null,
    companyName: "Acme",
    firstDetectedAt: new Date("2026-11-18T10:00:00Z"),
    ...marks,
  };
}

const CLOSED = new Date("2026-11-18T12:00:00Z");

describe("belongsToJobsTab", () => {
  // Та сама таблиця, що в запиті вкладок (src/server/vacancies/list.ts): після
  // дії рядок або лишається у вкладці, або зникає з неї без перечитування.
  const cases: Array<[string, VacancyListItem, JobsTabs]> = [
    [
      "an active unread one",
      vacancy({ isRead: false, isFavorite: false, closedAt: null }),
      { unread: true, read: false, favorites: false, all: true },
    ],
    [
      "an active read one",
      vacancy({ isRead: true, isFavorite: false, closedAt: null }),
      { unread: false, read: true, favorites: false, all: true },
    ],
    [
      "an active read favorite",
      vacancy({ isRead: true, isFavorite: true, closedAt: null }),
      { unread: false, read: true, favorites: true, all: true },
    ],
    [
      "a closed unread favorite",
      vacancy({ isRead: false, isFavorite: true, closedAt: CLOSED }),
      { unread: false, read: false, favorites: true, all: false },
    ],
  ];

  for (const [name, item, expected] of cases) {
    it(`places ${name}`, () => {
      expect({
        unread: belongsToJobsTab(item, "unread"),
        read: belongsToJobsTab(item, "read"),
        favorites: belongsToJobsTab(item, "favorites"),
        all: belongsToJobsTab(item, "all"),
      }).toEqual(expected);
    });
  }
});

type JobsTabs = Record<"unread" | "read" | "favorites" | "all", boolean>;

describe("parseJobsTab", () => {
  it("reads every known tab", () => {
    expect(parseJobsTab("unread")).toBe("unread");
    expect(parseJobsTab("read")).toBe("read");
    expect(parseJobsTab("favorites")).toBe("favorites");
    expect(parseJobsTab("all")).toBe("all");
  });

  it("falls back to Unread for anything else", () => {
    // Значення приходить з адреси або з аргумента Server Action: вкладка за
    // замовчуванням краща за помилку (docs/ui.md, розділ 4.1).
    expect(parseJobsTab(undefined)).toBe("unread");
    expect(parseJobsTab("Read")).toBe("unread");
    expect(parseJobsTab(["read"])).toBe("unread");
    expect(parseJobsTab(42)).toBe("unread");
  });
});

describe("patchVacancy", () => {
  const first = vacancy({ isRead: false, isFavorite: false, closedAt: null });
  const second = {
    ...vacancy({ isRead: false, isFavorite: false, closedAt: null }),
    id: "00000000-0000-4000-8000-000000000002",
  };

  it("changes the marks of one vacancy and keeps its place", () => {
    const patched = patchVacancy([first, second], {
      id: second.id,
      changes: { isRead: true },
    });

    expect(patched.map((item) => item.id)).toEqual([first.id, second.id]);
    expect(patched[1]).toEqual({ ...second, isRead: true });
    expect(patched[0]).toBe(first);
  });

  it("leaves the list as it is when the vacancy is not shown", () => {
    const list = [first];

    expect(
      patchVacancy(list, { id: second.id, changes: { isFavorite: true } }),
    ).toEqual(list);
  });
});
