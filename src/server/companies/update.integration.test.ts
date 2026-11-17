import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { careerSources, companies, users } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { normalizedSourceUrl } from "../db/testing/career-source-values.ts";
import { testDb } from "../db/testing/test-db.ts";
import { listCompanies } from "./list.ts";
import { updateCompany } from "./update.ts";

/** Компанія з одним відстежуваним джерелом. */
async function insertCompany(userId: string, name: string, slug = "acme") {
  const [company] = await testDb
    .insert(companies)
    .values({
      userId,
      name,
      url: `https://${slug}.com`,
      normalizedUrl: `${slug}.com`,
    })
    .returning();

  const [source] = await testDb
    .insert(careerSources)
    .values({
      companyId: company.id,
      url: `https://boards.greenhouse.io/${slug}`,
      normalizedUrl: normalizedSourceUrl(
        `https://boards.greenhouse.io/${slug}`,
      ),
      platform: "greenhouse",
    })
    .returning();

  return { company, source };
}

async function readCompany(id: string) {
  const [row] = await testDb
    .select()
    .from(companies)
    .where(eq(companies.id, id));

  return row;
}

async function readSources(companyId: string) {
  return testDb
    .select()
    .from(careerSources)
    .where(eq(careerSources.companyId, companyId));
}

describe("updateCompany", () => {
  it("renames the company", async () => {
    const user = await seedSystemUser(testDb);
    const { company } = await insertCompany(user.id, "Acme");

    const result = await updateCompany(testDb, {
      userId: user.id,
      companyId: company.id,
      name: "Acme Corp",
    });

    expect(result).toEqual({ ok: true });
    expect((await readCompany(company.id)).name).toBe("Acme Corp");
  });

  it("trims the new name", async () => {
    const user = await seedSystemUser(testDb);
    const { company } = await insertCompany(user.id, "Acme");

    await updateCompany(testDb, {
      userId: user.id,
      companyId: company.id,
      name: "  Acme Corp  ",
    });

    expect((await readCompany(company.id)).name).toBe("Acme Corp");
  });

  it("refuses an empty name and changes nothing", async () => {
    const user = await seedSystemUser(testDb);
    const { company, source } = await insertCompany(user.id, "Acme");

    const result = await updateCompany(testDb, {
      userId: user.id,
      companyId: company.id,
      name: "   ",
      removeSourceIds: [source.id],
    });

    expect(result).toEqual({ ok: false, problem: "name-required" });
    expect((await readCompany(company.id)).name).toBe("Acme");
    // Джерело теж на місці: відмова не має виконати половину роботи.
    expect(await readSources(company.id)).toHaveLength(1);
  });

  it("removes the asked-for sources", async () => {
    const user = await seedSystemUser(testDb);
    const { company, source } = await insertCompany(user.id, "Acme");
    const [kept] = await testDb
      .insert(careerSources)
      .values({
        companyId: company.id,
        url: "https://jobs.lever.co/acme",
        normalizedUrl: normalizedSourceUrl("https://jobs.lever.co/acme"),
        platform: "lever",
      })
      .returning();

    const result = await updateCompany(testDb, {
      userId: user.id,
      companyId: company.id,
      name: "Acme",
      removeSourceIds: [source.id],
    });

    expect(result).toEqual({ ok: true });
    expect((await readSources(company.id)).map((row) => row.id)).toEqual([
      kept.id,
    ]);
  });

  it("sends a company with no sources left to Not tracked", async () => {
    const user = await seedSystemUser(testDb);
    const { company, source } = await insertCompany(user.id, "Acme");
    // Статус із попереднього пошуку сторінок: після видалення джерел він
    // більше не описує стан компанії.
    await testDb
      .update(companies)
      .set({ discoveryStatus: "check_failed" })
      .where(eq(companies.id, company.id));

    await updateCompany(testDb, {
      userId: user.id,
      companyId: company.id,
      name: "Acme",
      removeSourceIds: [source.id],
    });

    expect((await readCompany(company.id)).discoveryStatus).toBe("not_checked");

    const { items } = await listCompanies(testDb, {
      userId: user.id,
      tab: "not-tracked",
    });

    expect(items.map((listed) => listed.name)).toEqual(["Acme"]);
  });

  it("keeps the discovery status while a source is left", async () => {
    const user = await seedSystemUser(testDb);
    const { company } = await insertCompany(user.id, "Acme");
    await testDb
      .update(companies)
      .set({ discoveryStatus: "not_found" })
      .where(eq(companies.id, company.id));

    await updateCompany(testDb, {
      userId: user.id,
      companyId: company.id,
      name: "Acme Corp",
    });

    expect((await readCompany(company.id)).discoveryStatus).toBe("not_found");
  });

  it("ignores a source id that belongs to another company", async () => {
    const user = await seedSystemUser(testDb);
    const mine = await insertCompany(user.id, "Acme", "acme");
    const other = await insertCompany(user.id, "Bosch", "bosch");

    const result = await updateCompany(testDb, {
      userId: user.id,
      companyId: mine.company.id,
      name: "Acme",
      removeSourceIds: [other.source.id],
    });

    expect(result).toEqual({ ok: true });
    expect(await readSources(other.company.id)).toHaveLength(1);
  });

  it("never touches another user's company", async () => {
    const owner = await seedSystemUser(testDb);
    const [stranger] = await testDb
      .insert(users)
      .values({ email: "other@job-digger.local" })
      .returning();
    const theirs = await insertCompany(stranger.id, "Bosch", "bosch");

    const result = await updateCompany(testDb, {
      userId: owner.id,
      companyId: theirs.company.id,
      name: "Renamed",
      removeSourceIds: [theirs.source.id],
    });

    expect(result).toEqual({ ok: false, problem: "not-found" });
    expect((await readCompany(theirs.company.id)).name).toBe("Bosch");
    expect(await readSources(theirs.company.id)).toHaveLength(1);
  });
});

describe("updateCompany adding a career source", () => {
  it("adds the address typed in the dialog", async () => {
    const user = await seedSystemUser(testDb);
    const { company } = await insertCompany(user.id, "Acme");

    const result = await updateCompany(testDb, {
      userId: user.id,
      companyId: company.id,
      name: "Acme",
      addSource: { url: "jobs.lever.co/acme", label: "  Europe  " },
    });

    expect(result).toEqual({ ok: true });
    expect(await readSources(company.id)).toEqual([
      expect.objectContaining({ url: "https://boards.greenhouse.io/acme" }),
      expect.objectContaining({
        // Адреса зберігається в абсолютній формі, підпис - обрізаним.
        url: "https://jobs.lever.co/acme",
        label: "Europe",
        platform: "lever",
        isTracked: true,
      }),
    ]);
  });

  it("stores a page nothing can read without tracking it", async () => {
    const user = await seedSystemUser(testDb);
    const { company } = await insertCompany(user.id, "Acme");

    await updateCompany(testDb, {
      userId: user.id,
      companyId: company.id,
      name: "Acme",
      addSource: { url: "acme.com/careers" },
    });

    expect(await readSources(company.id)).toContainEqual(
      expect.objectContaining({
        url: "https://acme.com/careers",
        label: null,
        platform: "unsupported",
        isTracked: false,
      }),
    );
  });

  it("refuses an address it cannot use and changes nothing", async () => {
    const user = await seedSystemUser(testDb);
    const { company } = await insertCompany(user.id, "Acme");

    const result = await updateCompany(testDb, {
      userId: user.id,
      companyId: company.id,
      name: "Acme Corp",
      addSource: { url: "ftp://acme.com/jobs" },
    });

    expect(result).toEqual({
      ok: false,
      problem: "source-url",
      reason: "unsupported-scheme",
    });
    // Відмова не виконує половину роботи: ні перейменування, ні вставки.
    expect((await readCompany(company.id)).name).toBe("Acme");
    expect(await readSources(company.id)).toHaveLength(1);
  });

  it("refuses an address the company already has", async () => {
    const user = await seedSystemUser(testDb);
    const { company } = await insertCompany(user.id, "Acme");

    const result = await updateCompany(testDb, {
      userId: user.id,
      companyId: company.id,
      name: "Acme",
      // Та сама адреса, що вставив `insertCompany`, лише з www. і слешем.
      addSource: { url: "https://www.boards.greenhouse.io/acme/" },
    });

    expect(result).toEqual({ ok: false, problem: "source-duplicate" });
    expect(await readSources(company.id)).toHaveLength(1);
  });

  // Живий кейс картки 2.16: три фільтри однієї сторінки mozilla.org.
  it("takes an address that differs only by its query", async () => {
    const user = await seedSystemUser(testDb);
    const { company } = await insertCompany(user.id, "Mozilla", "mozilla");
    await testDb.insert(careerSources).values({
      companyId: company.id,
      url: "https://www.mozilla.org/en-US/careers/listings/?location=Remote%20Canada",
      normalizedUrl: normalizedSourceUrl(
        "https://www.mozilla.org/en-US/careers/listings/?location=Remote%20Canada",
      ),
      platform: "unsupported",
      isTracked: false,
      label: "Remote Canada",
    });

    const result = await updateCompany(testDb, {
      userId: user.id,
      companyId: company.id,
      name: "Mozilla",
      addSource: {
        url: "https://www.mozilla.org/en-US/careers/listings/?location=Remote%20US",
        label: "Remote US",
      },
    });

    expect(result).toEqual({ ok: true });
    expect(await readSources(company.id)).toHaveLength(3);
  });

  // Видалення застосовується до перевірки дублікатів, інакше заміна адреси
  // на ту саму впиралася б у джерело, якого після Save вже не буде.
  it("lets one save remove a source and add the same address again", async () => {
    const user = await seedSystemUser(testDb);
    const { company, source } = await insertCompany(user.id, "Acme");

    const result = await updateCompany(testDb, {
      userId: user.id,
      companyId: company.id,
      name: "Acme",
      removeSourceIds: [source.id],
      addSource: { url: "boards.greenhouse.io/acme", label: "Global" },
    });

    expect(result).toEqual({ ok: true });
    expect(await readSources(company.id)).toEqual([
      expect.objectContaining({
        url: "https://boards.greenhouse.io/acme",
        label: "Global",
      }),
    ]);
  });

  it("brings a company with no sources back to Tracked", async () => {
    const user = await seedSystemUser(testDb);
    const [company] = await testDb
      .insert(companies)
      .values({
        userId: user.id,
        name: "Acme",
        url: "https://acme.com",
        normalizedUrl: "acme.com",
        discoveryStatus: "not_found",
      })
      .returning();

    await updateCompany(testDb, {
      userId: user.id,
      companyId: company.id,
      name: "Acme",
      addSource: { url: "boards.greenhouse.io/acme" },
    });

    const { items } = await listCompanies(testDb, {
      userId: user.id,
      tab: "tracked",
    });

    expect(items.map((listed) => listed.name)).toEqual(["Acme"]);
    // Статус пошуку додавання руками не чіпає: пошуку все одно не було.
    expect((await readCompany(company.id)).discoveryStatus).toBe("not_found");
  });

  it("never adds a source to another user's company", async () => {
    const owner = await seedSystemUser(testDb);
    const [stranger] = await testDb
      .insert(users)
      .values({ email: "other@job-digger.local" })
      .returning();
    const theirs = await insertCompany(stranger.id, "Bosch", "bosch");

    const result = await updateCompany(testDb, {
      userId: owner.id,
      companyId: theirs.company.id,
      name: "Bosch",
      addSource: { url: "jobs.lever.co/bosch" },
    });

    expect(result).toEqual({ ok: false, problem: "not-found" });
    expect(await readSources(theirs.company.id)).toHaveLength(1);
  });
});

describe("updateCompany labelling existing sources", () => {
  it("writes a label on a source that had none", async () => {
    const user = await seedSystemUser(testDb);
    const { company, source } = await insertCompany(user.id, "Mozilla");

    const result = await updateCompany(testDb, {
      userId: user.id,
      companyId: company.id,
      name: "Mozilla",
      sourceLabels: { [source.id]: "  Remote Canada  " },
    });

    expect(result).toEqual({ ok: true });
    expect((await readSources(company.id))[0].label).toBe("Remote Canada");
  });

  it("clears a label the user emptied", async () => {
    const user = await seedSystemUser(testDb);
    const { company, source } = await insertCompany(user.id, "Mozilla");
    await testDb
      .update(careerSources)
      .set({ label: "Remote Canada" })
      .where(eq(careerSources.id, source.id));

    await updateCompany(testDb, {
      userId: user.id,
      companyId: company.id,
      name: "Mozilla",
      sourceLabels: { [source.id]: "   " },
    });

    // Порожній підпис - це «підпису немає», а не порожній рядок у базі.
    expect((await readSources(company.id))[0].label).toBeNull();
  });

  it("never labels a source of another company", async () => {
    const user = await seedSystemUser(testDb);
    const mine = await insertCompany(user.id, "Acme", "acme");
    const other = await insertCompany(user.id, "Bosch", "bosch");

    const result = await updateCompany(testDb, {
      userId: user.id,
      companyId: mine.company.id,
      name: "Acme",
      sourceLabels: { [other.source.id]: "Stolen" },
    });

    expect(result).toEqual({ ok: true });
    expect((await readSources(other.company.id))[0].label).toBeNull();
  });

  it("applies renaming, labelling, removing and adding in one save", async () => {
    const user = await seedSystemUser(testDb);
    const { company, source } = await insertCompany(
      user.id,
      "Mozilla",
      "mozilla",
    );
    const [dropped] = await testDb
      .insert(careerSources)
      .values({
        companyId: company.id,
        url: "https://jobs.lever.co/mozilla",
        normalizedUrl: normalizedSourceUrl("https://jobs.lever.co/mozilla"),
        platform: "lever",
      })
      .returning();

    const result = await updateCompany(testDb, {
      userId: user.id,
      companyId: company.id,
      name: "Mozilla Corporation",
      sourceLabels: { [source.id]: "Global" },
      removeSourceIds: [dropped.id],
      addSource: {
        url: "https://www.mozilla.org/en-US/careers/listings/?location=Remote%20US",
        label: "Remote US",
      },
    });

    expect(result).toEqual({ ok: true });
    expect((await readCompany(company.id)).name).toBe("Mozilla Corporation");
    expect(
      (await readSources(company.id)).map((row) => [row.url, row.label]),
    ).toEqual([
      ["https://boards.greenhouse.io/mozilla", "Global"],
      [
        "https://www.mozilla.org/en-US/careers/listings/?location=Remote%20US",
        "Remote US",
      ],
    ]);
  });

  it("refuses a new source that already belongs to another company", async () => {
    const user = await seedSystemUser(testDb);
    const { company } = await insertCompany(user.id, "Acme");
    const { company: other } = await insertCompany(user.id, "Bosch", "bosch");

    const result = await updateCompany(testDb, {
      userId: user.id,
      companyId: company.id,
      name: "Acme",
      addSource: { url: "https://www.boards.greenhouse.io/bosch/" },
    });

    expect(result).toMatchObject({
      ok: false,
      problem: "source-taken",
      company: { id: other.id, name: "Bosch" },
    });
    expect(await readSources(company.id)).toHaveLength(1);
  });

  it("does not call its own source a page of another company", async () => {
    const user = await seedSystemUser(testDb);
    const { company, source } = await insertCompany(user.id, "Acme");

    // Власне джерело компанії - дублікат усередині неї, і про це вже є окрема
    // відмова. Перевірка між компаніями тут спрацювати не має.
    const result = await updateCompany(testDb, {
      userId: user.id,
      companyId: company.id,
      name: "Acme",
      addSource: { url: source.url },
    });

    expect(result).toEqual({ ok: false, problem: "source-duplicate" });
  });
});
