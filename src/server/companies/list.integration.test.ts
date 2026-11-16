import { describe, expect, it } from "vitest";

import { careerSources, companies, users } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
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
    // Друге джерело тієї ж компанії: у списку видно обидва.
    await testDb.insert(careerSources).values({
      companyId: company.id,
      url: "https://jobs.lever.co/bosch",
      platform: "lever",
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
      },
      {
        id: expect.any(String),
        url: "https://jobs.lever.co/bosch",
        platform: "lever",
        isTracked: true,
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
    });
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
        },
      ],
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
