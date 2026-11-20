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

/** Компанія з відстежуваним джерелом - така потрапляє у вкладку Tracked. */
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

/** Компанія без жодного відстежуваного джерела - вкладка Not tracked. */
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
    // Сторінка, яку нічим прочитати: адреса збережена, але не перевіряється.
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
    // Вставлені не за алфавітом, щоб порядок був вибором коду, а не бази.
    await insertTracked(user.id, "Zeta");
    await insertTracked(user.id, "Acme");
    await insertTracked(user.id, "Mango");

    const { items: tracked } = await listCompanies(testDb, {
      userId: user.id,
      tab: "tracked",
      // Ліміт заданий явно: тест про порядок, а не про розмір порції.
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
    // Друге джерело тієї ж компанії: у списку видно обидва. Підпис є лише в
    // нього - саме так список показує, чим джерела відрізняються.
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

  // Назва не унікальна, і саме на ній ламалася б пагінація за одним полем:
  // умова `name > 'Acme'` пропустила б решту однойменних компаній.
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
    // Три різні компанії, жодна не прийшла двічі.
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

  // Курсор приходить із клієнта, тому зіпсоване значення - очікуваний випадок.
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

describe("countCompaniesByTab", () => {
  it("counts both tabs in one go, because both numbers are shown at once", async () => {
    const user = await seedSystemUser(testDb);
    await insertTracked(user.id, "Bosch");
    await insertTracked(user.id, "Cisco");
    await insertUntracked(user.id, "Acme");

    expect(await countCompaniesByTab(testDb, user.id)).toEqual({
      tracked: 2,
      notTracked: 1,
      attention: 0,
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
    });
  });
});

describe("Needs attention", () => {
  // Задача 6.11: компанія потребує уваги, якщо в неї є сторінка, яку ми не
  // читаємо, або відстежуване джерело падає кілька разів поспіль.
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

  it("takes a source that failed twice in a row, but not once", async () => {
    // Одна невдача - мережа моргнула, смикати користувача не варто.
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
    // Сторінку без відстеження не перевіряють, її давній збій - не новина.
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
    // Дві сторінки, які ми не читаємо, - однаково одна компанія.
    await addSource(mozilla.id, "https://mozilla.org/careers/listings?de", {
      platform: "unsupported",
      isTracked: false,
    });

    expect(await countCompaniesByTab(testDb, user.id)).toEqual({
      tracked: 2,
      notTracked: 0,
      attention: 1,
    });
  });

  it("answers null once the company no longer needs attention", async () => {
    // Так список прибирає рядок, коли користувач видалив непрочитану сторінку.
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

  // Саме цим список дізнається, що після Save рядок треба прибрати: компанія
  // без відстежуваних джерел на вкладці Tracked більше не місце.
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
  /** Вакансії першого джерела компанії: `favorites` із них - у Favorites. */
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
  // Статус компанії й «Last ok» на вкладці Tracked (docs/ui.md, розділ 4.2).
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
