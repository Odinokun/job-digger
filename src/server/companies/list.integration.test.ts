import { describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import {
  careerSources,
  checkTasks,
  companies,
  users,
  vacancies,
} from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { normalizedSourceUrl } from "../db/testing/career-source-values.ts";
import { testDb } from "../db/testing/test-db.ts";
import {
  countCompaniesByTab,
  findCompanyInTab,
  listCompanies,
} from "./list.ts";

/** A company with a tracked source - it goes to the Tracked tab. */
async function insertTracked(
  userId: string,
  name: string,
  slug = name.toLowerCase(),
) {
  const [company] = await testDb
    .insert(companies)
    .values({
      userId,
      name,
      url: `https://${slug}.com`,
      normalizedUrl: `${slug}.com`,
    })
    .returning();

  await testDb.insert(careerSources).values({
    companyId: company.id,
    url: `https://boards.greenhouse.io/${slug}`,
    normalizedUrl: normalizedSourceUrl(`https://boards.greenhouse.io/${slug}`),
    platform: "greenhouse",
  });

  return company;
}

/** A company without a single tracked source - the Not tracked tab. */
async function insertUntracked(userId: string, name: string) {
  const [company] = await testDb
    .insert(companies)
    .values({
      userId,
      name,
      url: `https://${name.toLowerCase()}.com`,
      normalizedUrl: `${name.toLowerCase()}.com`,
      discoveryStatus: "not_found",
    })
    .returning();

  return company;
}

describe("listCompanies", () => {
  it("puts a company with a tracked source on the Tracked tab", async () => {
    const user = await seedSystemUser(testDb);
    await insertTracked(user.id, "Bosch");
    await insertUntracked(user.id, "Acme");

    const { items: tracked } = await listCompanies(testDb, {
      userId: user.id,
      tab: "tracked",
    });

    expect(tracked.map((company) => company.name)).toEqual(["Bosch"]);
  });

  it("puts a company with no tracked source on the Not tracked tab", async () => {
    const user = await seedSystemUser(testDb);
    await insertTracked(user.id, "Bosch");
    await insertUntracked(user.id, "Acme");

    const { items: notTracked } = await listCompanies(testDb, {
      userId: user.id,
      tab: "not-tracked",
    });

    expect(notTracked.map((company) => company.name)).toEqual(["Acme"]);
  });

  it("counts a company whose only source is not tracked as Not tracked", async () => {
    const user = await seedSystemUser(testDb);
    const company = await insertUntracked(user.id, "Acme");
    // A page nothing can read: the address is saved but not checked.
    await testDb.insert(careerSources).values({
      companyId: company.id,
      url: "https://acme.com/careers",
      normalizedUrl: normalizedSourceUrl("https://acme.com/careers"),
      platform: "unsupported",
      isTracked: false,
    });

    const { items: notTracked } = await listCompanies(testDb, {
      userId: user.id,
      tab: "not-tracked",
    });

    expect(notTracked.map((company) => company.name)).toEqual(["Acme"]);
  });

  it("sorts by name, because that is the order the list is read in", async () => {
    const user = await seedSystemUser(testDb);
    // Inserted out of alphabetical order, so the order is the code's choice, not the database's.
    await insertTracked(user.id, "Zeta");
    await insertTracked(user.id, "Acme");
    await insertTracked(user.id, "Mango");

    const { items: tracked } = await listCompanies(testDb, {
      userId: user.id,
      tab: "tracked",
      // The limit is explicit: the test is about order, not page size.
      limit: 10,
    });

    expect(tracked.map((company) => company.name)).toEqual([
      "Acme",
      "Mango",
      "Zeta",
    ]);
  });

  it("returns at most the asked-for number of companies", async () => {
    const user = await seedSystemUser(testDb);
    await insertTracked(user.id, "Acme");
    await insertTracked(user.id, "Bosch");
    await insertTracked(user.id, "Cisco");

    const { items: tracked } = await listCompanies(testDb, {
      userId: user.id,
      tab: "tracked",
      limit: 2,
    });

    expect(tracked.map((company) => company.name)).toEqual(["Acme", "Bosch"]);
  });

  it("never returns another user's companies", async () => {
    const owner = await seedSystemUser(testDb);
    const [other] = await testDb
      .insert(users)
      .values({ email: "other@job-digger.local" })
      .returning();
    await insertTracked(other.id, "Bosch");

    const { items: tracked } = await listCompanies(testDb, {
      userId: owner.id,
      tab: "tracked",
    });

    expect(tracked).toEqual([]);
  });

  it("brings the career sources along, since the list shows them", async () => {
    const user = await seedSystemUser(testDb);
    const company = await insertTracked(user.id, "Bosch");
    // A second source of the same company: the list shows both. Only it has a
    // label - this is how the list shows how the sources differ.
    await testDb.insert(careerSources).values({
      companyId: company.id,
      url: "https://jobs.lever.co/bosch",
      normalizedUrl: normalizedSourceUrl("https://jobs.lever.co/bosch"),
      platform: "lever",
      label: "Remote Canada",
    });

    const {
      items: [listed],
    } = await listCompanies(testDb, {
      userId: user.id,
      tab: "tracked",
    });

    expect(listed.sources).toEqual([
      {
        id: expect.any(String),
        url: "https://boards.greenhouse.io/bosch",
        platform: "greenhouse",
        isTracked: true,
        isReferenceOnly: false,
        label: null,
        lastCheck: null,
        lastSuccessAt: null,
        isChecking: false,
      },
      {
        id: expect.any(String),
        url: "https://jobs.lever.co/bosch",
        platform: "lever",
        isTracked: true,
        isReferenceOnly: false,
        label: "Remote Canada",
        lastCheck: null,
        lastSuccessAt: null,
        isChecking: false,
      },
    ]);
  });
});

describe("listCompanies pagination", () => {
  it("hands back a cursor while more companies are left", async () => {
    const user = await seedSystemUser(testDb);
    await insertTracked(user.id, "Acme");
    await insertTracked(user.id, "Bosch");
    await insertTracked(user.id, "Cisco");

    const first = await listCompanies(testDb, {
      userId: user.id,
      tab: "tracked",
      limit: 2,
    });

    expect(first.items.map((company) => company.name)).toEqual([
      "Acme",
      "Bosch",
    ]);
    expect(first.nextCursor).toEqual({ key: "Bosch", id: expect.any(String) });
  });

  it("has no cursor on the last portion", async () => {
    const user = await seedSystemUser(testDb);
    await insertTracked(user.id, "Acme");
    await insertTracked(user.id, "Bosch");

    const only = await listCompanies(testDb, {
      userId: user.id,
      tab: "tracked",
      limit: 2,
    });

    expect(only.items).toHaveLength(2);
    expect(only.nextCursor).toBeNull();
  });

  it("continues after the cursor without a gap or a repeat", async () => {
    const user = await seedSystemUser(testDb);
    await insertTracked(user.id, "Acme");
    await insertTracked(user.id, "Bosch");
    await insertTracked(user.id, "Cisco");
    await insertTracked(user.id, "Delta");

    const first = await listCompanies(testDb, {
      userId: user.id,
      tab: "tracked",
      limit: 2,
    });
    const second = await listCompanies(testDb, {
      userId: user.id,
      tab: "tracked",
      limit: 2,
      after: first.nextCursor,
    });

    expect(second.items.map((company) => company.name)).toEqual([
      "Cisco",
      "Delta",
    ]);
    expect(second.nextCursor).toBeNull();
  });

  // The name is not unique, and single-column pagination would break on it:
  // the condition `name > 'Acme'` would skip the other companies of that name.
  it("walks through companies that share a name", async () => {
    const user = await seedSystemUser(testDb);
    await insertTracked(user.id, "Acme", "acme-one");
    await insertTracked(user.id, "Acme", "acme-two");
    await insertTracked(user.id, "Acme", "acme-three");

    const first = await listCompanies(testDb, {
      userId: user.id,
      tab: "tracked",
      limit: 2,
    });
    const second = await listCompanies(testDb, {
      userId: user.id,
      tab: "tracked",
      limit: 2,
      after: first.nextCursor,
    });

    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);
    // Three different companies, none came twice.
    expect(
      new Set([...first.items, ...second.items].map((company) => company.id))
        .size,
    ).toBe(3);
  });

  it("stays inside the asking user even with a cursor", async () => {
    const owner = await seedSystemUser(testDb);
    const [other] = await testDb
      .insert(users)
      .values({ email: "other@job-digger.local" })
      .returning();
    await insertTracked(owner.id, "Acme");
    await insertTracked(other.id, "Bosch", "bosch-other");

    const first = await listCompanies(testDb, {
      userId: owner.id,
      tab: "tracked",
      limit: 1,
    });
    const second = await listCompanies(testDb, {
      userId: owner.id,
      tab: "tracked",
      limit: 1,
      after: { key: "Acme", id: first.items[0].id },
    });

    expect(first.nextCursor).toBeNull();
    expect(second.items).toEqual([]);
  });

  // The cursor comes from the client, so a corrupted value is an expected case.
  it("starts from the beginning when the cursor is not usable", async () => {
    const user = await seedSystemUser(testDb);
    await insertTracked(user.id, "Acme");
    await insertTracked(user.id, "Bosch");

    const page = await listCompanies(testDb, {
      userId: user.id,
      tab: "tracked",
      after: { key: "Acme", id: "not-a-uuid" },
    });

    expect(page.items.map((company) => company.name)).toEqual([
      "Acme",
      "Bosch",
    ]);
  });
});

describe("All tab", () => {
  it("lists every company of the user, tracked or not, by name", async () => {
    const user = await seedSystemUser(testDb);
    await insertTracked(user.id, "Bosch");
    await insertUntracked(user.id, "Acme");

    const { items } = await listCompanies(testDb, {
      userId: user.id,
      tab: "all",
    });

    expect(items.map((company) => company.name)).toEqual(["Acme", "Bosch"]);
  });
});

describe("company search", () => {
  async function namesFound(userId: string, query: string) {
    const { items } = await listCompanies(testDb, {
      userId,
      tab: "all",
      query,
    });

    return items.map((company) => company.name);
  }

  it("finds companies whose name contains the query, in any case", async () => {
    const user = await seedSystemUser(testDb);
    await insertTracked(user.id, "Acme");
    await insertTracked(user.id, "Black Acorn", "black-acorn");
    await insertTracked(user.id, "Bosch");

    expect(await namesFound(user.id, "aC")).toEqual(["Acme", "Black Acorn"]);
  });

  it("shows everything for an empty or blank query", async () => {
    const user = await seedSystemUser(testDb);
    await insertTracked(user.id, "Acme");
    await insertTracked(user.id, "Bosch");

    expect(await namesFound(user.id, "  ")).toEqual(["Acme", "Bosch"]);
  });

  it("takes % and _ in the query literally", async () => {
    // Otherwise "%" would match everything and "_" any character.
    const user = await seedSystemUser(testDb);
    await insertTracked(user.id, "50% Off", "fifty");
    await insertTracked(user.id, "500 Startups", "five-hundred");
    await insertTracked(user.id, "Big_Data", "big-data");
    await insertTracked(user.id, "BigXData", "bigx");

    expect(await namesFound(user.id, "50%")).toEqual(["50% Off"]);
    expect(await namesFound(user.id, "g_d")).toEqual(["Big_Data"]);
  });

  it("keeps the query on the next portion", async () => {
    const user = await seedSystemUser(testDb);
    await insertTracked(user.id, "Acme");
    await insertTracked(user.id, "Acme Labs", "acme-labs");
    await insertTracked(user.id, "Bosch");

    const first = await listCompanies(testDb, {
      userId: user.id,
      tab: "all",
      query: "acme",
      limit: 1,
    });
    const next = await listCompanies(testDb, {
      userId: user.id,
      tab: "all",
      query: "acme",
      limit: 1,
      after: first.nextCursor,
    });

    expect(next.items.map((company) => company.name)).toEqual(["Acme Labs"]);
    expect(next.nextCursor).toBeNull();
  });
});

describe("countCompaniesByTab", () => {
  it("counts every tab in one go, because all numbers are shown at once", async () => {
    const user = await seedSystemUser(testDb);
    await insertTracked(user.id, "Bosch");
    await insertTracked(user.id, "Cisco");
    await insertUntracked(user.id, "Acme");

    expect(await countCompaniesByTab(testDb, user.id)).toEqual({
      tracked: 2,
      notTracked: 1,
      attention: 0,
      all: 3,
    });
  });

  it("counts only the asking user's companies", async () => {
    const owner = await seedSystemUser(testDb);
    const [other] = await testDb
      .insert(users)
      .values({ email: "other@job-digger.local" })
      .returning();
    await insertTracked(other.id, "Bosch");

    expect(await countCompaniesByTab(testDb, owner.id)).toEqual({
      tracked: 0,
      notTracked: 0,
      attention: 0,
      all: 0,
    });
  });
});

describe("Needs attention", () => {
  // Task 6.11: a company needs attention if it has a page we do not read, or a
  // tracked source fails several times in a row.
  async function addSource(
    companyId: string,
    url: string,
    values: Partial<typeof careerSources.$inferInsert> = {},
  ) {
    const [source] = await testDb
      .insert(careerSources)
      .values({
        companyId,
        url,
        normalizedUrl: normalizedSourceUrl(url),
        platform: "greenhouse",
        ...values,
      })
      .returning();

    return source;
  }

  async function attentionNames(userId: string) {
    const { items } = await listCompanies(testDb, {
      userId,
      tab: "attention",
    });

    return items.map((company) => company.name);
  }

  it("takes a tracked company that also has a page we cannot read", async () => {
    const user = await seedSystemUser(testDb);
    const mozilla = await insertTracked(user.id, "Mozilla");
    await insertTracked(user.id, "Bosch");
    await addSource(mozilla.id, "https://mozilla.org/careers/listings", {
      platform: "unsupported",
      isTracked: false,
    });

    expect(await attentionNames(user.id)).toEqual(["Mozilla"]);
  });

  it("takes a not tracked company whose only page we cannot read", async () => {
    const user = await seedSystemUser(testDb);
    const acme = await insertUntracked(user.id, "Acme");
    await insertUntracked(user.id, "Globex");
    await addSource(acme.id, "https://acme.com/careers", {
      platform: "unsupported",
      isTracked: false,
    });

    expect(await attentionNames(user.id)).toEqual(["Acme"]);
  });

  it("leaves out a page the user marked as reference only", async () => {
    // Task 6.17: the kinggroup own page nothing can read, next to a PeopleForce
    // board that is read. Once marked, it no longer keeps the company here, and
    // the mark is visible in the source row.
    const user = await seedSystemUser(testDb);
    const kinggroup = await insertTracked(user.id, "Kinggroup");
    const ownPage = await addSource(
      kinggroup.id,
      "https://kinggroup.io/vacancies/tech",
      { platform: "unsupported", isTracked: false, isReferenceOnly: true },
    );

    expect(await attentionNames(user.id)).toEqual([]);

    const found = await findCompanyInTab(testDb, {
      userId: user.id,
      companyId: kinggroup.id,
      tab: "tracked",
    });
    expect(
      found?.sources.find((source) => source.id === ownPage.id),
    ).toMatchObject({ isReferenceOnly: true });
  });

  it("takes a source that failed twice in a row, but not once", async () => {
    // One failure is the network blinking, not worth bothering the user.
    const user = await seedSystemUser(testDb);
    const bosch = await insertTracked(user.id, "Bosch");
    const cisco = await insertTracked(user.id, "Cisco");
    await testDb
      .update(careerSources)
      .set({ consecutiveFailures: 2 })
      .where(eq(careerSources.companyId, bosch.id));
    await testDb
      .update(careerSources)
      .set({ consecutiveFailures: 1 })
      .where(eq(careerSources.companyId, cisco.id));

    expect(await attentionNames(user.id)).toEqual(["Bosch"]);
  });

  it("ignores failures of a source that is not tracked", async () => {
    // An untracked page is not checked; its old failure is not news.
    const user = await seedSystemUser(testDb);
    const acme = await insertUntracked(user.id, "Acme");
    await addSource(acme.id, "https://boards.greenhouse.io/acme", {
      isTracked: false,
      consecutiveFailures: 5,
    });

    expect(await attentionNames(user.id)).toEqual([]);
  });

  it("counts companies that need attention next to both tabs", async () => {
    const user = await seedSystemUser(testDb);
    const mozilla = await insertTracked(user.id, "Mozilla");
    await insertTracked(user.id, "Bosch");
    await addSource(mozilla.id, "https://mozilla.org/careers/listings", {
      platform: "unsupported",
      isTracked: false,
    });
    // Two pages we do not read are still one company.
    await addSource(mozilla.id, "https://mozilla.org/careers/listings?de", {
      platform: "unsupported",
      isTracked: false,
    });

    expect(await countCompaniesByTab(testDb, user.id)).toEqual({
      tracked: 2,
      notTracked: 0,
      attention: 1,
      all: 2,
    });
  });

  it("answers null once the company no longer needs attention", async () => {
    // This is how the list removes the row when the user deleted the unread page.
    const user = await seedSystemUser(testDb);
    const bosch = await insertTracked(user.id, "Bosch");

    expect(
      await findCompanyInTab(testDb, {
        userId: user.id,
        companyId: bosch.id,
        tab: "attention",
      }),
    ).toBeNull();
  });
});

describe("findCompanyInTab", () => {
  it("returns the company with its sources", async () => {
    const user = await seedSystemUser(testDb);
    const company = await insertTracked(user.id, "Bosch");

    const found = await findCompanyInTab(testDb, {
      userId: user.id,
      companyId: company.id,
      tab: "tracked",
    });

    expect(found).toEqual({
      id: company.id,
      name: "Bosch",
      url: "https://bosch.com",
      discoveryStatus: "not_checked",
      sources: [
        {
          id: expect.any(String),
          url: "https://boards.greenhouse.io/bosch",
          platform: "greenhouse",
          isTracked: true,
          isReferenceOnly: false,
          label: null,
          lastCheck: null,
          lastSuccessAt: null,
          isChecking: false,
        },
      ],
      vacancies: { total: 0, favorites: 0 },
      lastCheckedAt: null,
    });
  });

  // This is how the list learns the row has to go after Save: a company without
  // tracked sources no longer belongs on the Tracked tab.
  it("answers null when the company no longer belongs to the tab", async () => {
    const user = await seedSystemUser(testDb);
    const company = await insertUntracked(user.id, "Acme");

    expect(
      await findCompanyInTab(testDb, {
        userId: user.id,
        companyId: company.id,
        tab: "tracked",
      }),
    ).toBeNull();
  });

  it("never returns another user's company", async () => {
    const owner = await seedSystemUser(testDb);
    const [other] = await testDb
      .insert(users)
      .values({ email: "other@job-digger.local" })
      .returning();
    const theirs = await insertTracked(other.id, "Bosch");

    expect(
      await findCompanyInTab(testDb, {
        userId: owner.id,
        companyId: theirs.id,
        tab: "tracked",
      }),
    ).toBeNull();
  });
});

describe("vacancy counts", () => {
  /** Vacancies of the company's first source: `favorites` of them go to Favorites. */
  async function addVacancies(
    companyId: string,
    total: number,
    favorites: number,
  ) {
    const [source] = await testDb
      .select({ id: careerSources.id })
      .from(careerSources)
      .where(eq(careerSources.companyId, companyId));

    for (let i = 0; i < total; i += 1) {
      await testDb.insert(vacancies).values({
        sourceId: source.id,
        key: `id:${i}`,
        title: `Job ${i}`,
        url: `https://example.com/jobs/${i}`,
        isFavorite: i < favorites,
      });
    }
  }

  it("counts the vacancies of each company and how many are favorites", async () => {
    const user = await seedSystemUser(testDb);
    const bosch = await insertTracked(user.id, "Bosch");
    const linear = await insertTracked(user.id, "Linear");
    await addVacancies(bosch.id, 3, 1);
    await addVacancies(linear.id, 2, 0);

    const { items } = await listCompanies(testDb, {
      userId: user.id,
      tab: "tracked",
    });

    expect(items.map(({ name, vacancies }) => ({ name, vacancies }))).toEqual([
      { name: "Bosch", vacancies: { total: 3, favorites: 1 } },
      { name: "Linear", vacancies: { total: 2, favorites: 0 } },
    ]);
  });

  it("gives zero to a company without vacancies", async () => {
    const user = await seedSystemUser(testDb);
    await insertUntracked(user.id, "Acme");

    const { items } = await listCompanies(testDb, {
      userId: user.id,
      tab: "not-tracked",
    });

    expect(items[0]?.vacancies).toEqual({ total: 0, favorites: 0 });
  });

  it("counts the same way for a single company found by id", async () => {
    const user = await seedSystemUser(testDb);
    const bosch = await insertTracked(user.id, "Bosch");
    await addVacancies(bosch.id, 2, 2);

    const company = await findCompanyInTab(testDb, {
      userId: user.id,
      companyId: bosch.id,
      tab: "tracked",
    });

    expect(company?.vacancies).toEqual({ total: 2, favorites: 2 });
  });
});

describe("last checked", () => {
  it("is the latest check among the company's sources", async () => {
    const user = await seedSystemUser(testDb);
    const bosch = await insertTracked(user.id, "Bosch");
    const earlier = new Date("2026-11-17T10:00:00Z");
    const later = new Date("2026-11-18T10:00:00Z");
    await testDb
      .update(careerSources)
      .set({ lastCheckedAt: earlier })
      .where(eq(careerSources.companyId, bosch.id));
    await testDb.insert(careerSources).values({
      companyId: bosch.id,
      url: "https://jobs.lever.co/bosch",
      normalizedUrl: "jobs.lever.co/bosch",
      platform: "lever",
      lastCheckedAt: later,
    });

    const company = await findCompanyInTab(testDb, {
      userId: user.id,
      companyId: bosch.id,
      tab: "tracked",
    });

    expect(company?.lastCheckedAt).toEqual(later);
  });

  it("is null while no source has been checked", async () => {
    const user = await seedSystemUser(testDb);
    await insertTracked(user.id, "Bosch");

    const { items } = await listCompanies(testDb, {
      userId: user.id,
      tab: "tracked",
    });

    expect(items[0]?.lastCheckedAt).toBeNull();
  });
});

describe("source check state", () => {
  // The company status and "Last ok" on the Tracked tab.
  async function sourceOf(name: string) {
    const user = await seedSystemUser(testDb);
    const company = await insertTracked(user.id, name);
    const [source] = await testDb
      .select()
      .from(careerSources)
      .where(eq(careerSources.companyId, company.id));
    const read = async () => {
      const found = await findCompanyInTab(testDb, {
        userId: user.id,
        companyId: company.id,
        tab: "tracked",
      });
      return found?.sources[0];
    };
    return { source, read };
  }

  it("has no last check before the first one", async () => {
    const { read } = await sourceOf("Bosch");

    expect(await read()).toMatchObject({
      lastCheck: null,
      lastSuccessAt: null,
      isChecking: false,
    });
  });

  it("reports a successful last check", async () => {
    const { source, read } = await sourceOf("Bosch");
    const at = new Date("2026-11-18T10:00:00Z");
    await testDb
      .update(careerSources)
      .set({ lastCheckedAt: at, lastSuccessAt: at, consecutiveFailures: 0 })
      .where(eq(careerSources.id, source.id));

    expect(await read()).toMatchObject({ lastCheck: "ok", lastSuccessAt: at });
  });

  it("reports a failed last check with the last success", async () => {
    const { source, read } = await sourceOf("Bosch");
    const lastOk = new Date("2026-11-07T10:00:00Z");
    await testDb
      .update(careerSources)
      .set({
        lastCheckedAt: new Date("2026-11-18T10:00:00Z"),
        lastSuccessAt: lastOk,
        consecutiveFailures: 3,
      })
      .where(eq(careerSources.id, source.id));

    expect(await read()).toMatchObject({
      lastCheck: "failed",
      lastSuccessAt: lastOk,
    });
  });

  it("marks a source with a queued or running task", async () => {
    const { source, read } = await sourceOf("Bosch");
    await testDb.insert(checkTasks).values({ sourceId: source.id });

    expect(await read()).toMatchObject({ isChecking: true });

    await testDb
      .update(checkTasks)
      .set({ status: "running", lockedAt: new Date() })
      .where(eq(checkTasks.sourceId, source.id));
    expect(await read()).toMatchObject({ isChecking: true });

    await testDb
      .update(checkTasks)
      .set({ status: "failed" })
      .where(eq(checkTasks.sourceId, source.id));
    expect(await read()).toMatchObject({ isChecking: false });
  });
});
