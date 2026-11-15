import { describe, expect, it } from "vitest";

import { careerSources, companies, users } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { testDb } from "../db/testing/test-db.ts";
import { countCompaniesByTab, listCompanies } from "./list.ts";

/** Компанія з відстежуваним джерелом - така потрапляє у вкладку Tracked. */
async function insertTracked(userId: string, name: string) {
  const [company] = await testDb
    .insert(companies)
    .values({
      userId,
      name,
      url: `https://${name.toLowerCase()}.com`,
      normalizedUrl: `${name.toLowerCase()}.com`,
    })
    .returning();

  await testDb.insert(careerSources).values({
    companyId: company.id,
    url: `https://boards.greenhouse.io/${name.toLowerCase()}`,
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

    const tracked = await listCompanies(testDb, {
      userId: user.id,
      tab: "tracked",
    });

    expect(tracked.map((company) => company.name)).toEqual(["Bosch"]);
  });

  it("puts a company with no tracked source on the Not tracked tab", async () => {
    const user = await seedSystemUser(testDb);
    await insertTracked(user.id, "Bosch");
    await insertUntracked(user.id, "Acme");

    const notTracked = await listCompanies(testDb, {
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

    const notTracked = await listCompanies(testDb, {
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

    const tracked = await listCompanies(testDb, {
      userId: user.id,
      tab: "tracked",
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

    const tracked = await listCompanies(testDb, {
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

    const tracked = await listCompanies(testDb, {
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

    const [listed] = await listCompanies(testDb, {
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
