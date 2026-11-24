import { describe, expect, it } from "vitest";

import {
  adjustTabCounts,
  belongsToJobsTab,
  countNewVacancies,
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
    favoritedAt: null,
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

describe("countNewVacancies", () => {
  // Порядок списку - як у запиті вкладок: дата виявлення, потім id, обидва
  // за спаданням. Вакансії однієї перевірки мають одну дату.
  function found(id: number, at: string): VacancyListItem {
    return {
      ...vacancy({ isRead: false, isFavorite: false, closedAt: null }),
      id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
      firstDetectedAt: new Date(at),
    };
  }

  const EARLIER = "2026-11-18T10:00:00Z";
  const LATER = "2026-11-19T10:00:00Z";

  it("finds nothing new when the fresh page is what is shown", () => {
    const shown = [found(3, EARLIER), found(2, EARLIER)];

    expect(countNewVacancies(shown, [...shown])).toBe(0);
  });

  it("counts vacancies found after the list was shown", () => {
    const shown = [found(3, EARLIER), found(2, EARLIER)];
    const fresh = [found(1, LATER), found(9, LATER), ...shown];

    expect(countNewVacancies(shown, fresh)).toBe(2);
  });

  it("counts a vacancy that lands between the shown ones", () => {
    // Перевірка ще йде: нова вакансія має ту саму дату, що вже показані, і за
    // id стає посеред списку, а не нагорі.
    const shown = [found(5, LATER), found(3, LATER)];
    const fresh = [found(5, LATER), found(4, LATER), found(3, LATER)];

    expect(countNewVacancies(shown, fresh)).toBe(1);
  });

  it("ignores vacancies that moved up from the next portion", () => {
    // Рядок прочитали в Unread, і в першу порцію підтягнувся наступний, ще не
    // показаний. Він не новий: його покаже Load more.
    const shown = [found(5, EARLIER), found(3, EARLIER)];
    const fresh = [found(5, EARLIER), found(3, EARLIER), found(2, EARLIER)];

    expect(countNewVacancies(shown, fresh)).toBe(0);
  });

  it("does not count shown vacancies that left the fresh page", () => {
    // Позначка прийшла на сервер: рядок вийшов із вкладки, а в показаному
    // списку ще є. Це не нова вакансія.
    const shown = [found(5, EARLIER), found(3, EARLIER)];

    expect(countNewVacancies(shown, [found(3, EARLIER)])).toBe(0);
  });

  it("counts the whole fresh page when nothing is shown", () => {
    expect(countNewVacancies([], [found(2, LATER), found(1, LATER)])).toBe(2);
  });
});

describe("adjustTabCounts", () => {
  const counts = { unread: 3, read: 5, favorites: 2, all: 8 };
  const unread = vacancy({ isRead: false, isFavorite: false, closedAt: null });

  it("keeps the counts while nothing is pending", () => {
    expect(adjustTabCounts(counts, [unread], [unread])).toEqual(counts);
  });

  it("moves a vacancy marked as read from Unread to Read", () => {
    const read = { ...unread, isRead: true };

    expect(adjustTabCounts(counts, [unread], [read])).toEqual({
      unread: 2,
      read: 6,
      favorites: 2,
      all: 8,
    });
  });

  it("adds a starred vacancy to Favorites only", () => {
    const starred = { ...unread, isFavorite: true };

    expect(adjustTabCounts(counts, [unread], [starred])).toEqual({
      unread: 3,
      read: 5,
      favorites: 3,
      all: 8,
    });
  });

  it("matches rows by id, not by position", () => {
    const other = { ...unread, id: "00000000-0000-4000-8000-000000000002" };
    const read = { ...unread, isRead: true };

    expect(adjustTabCounts(counts, [unread, other], [other, read])).toEqual({
      unread: 2,
      read: 6,
      favorites: 2,
      all: 8,
    });
  });

  it("never goes below zero", () => {
    const read = { ...unread, isRead: true };
    const empty = { unread: 0, read: 0, favorites: 0, all: 0 };

    expect(adjustTabCounts(empty, [unread], [read]).unread).toBe(0);
  });
});
