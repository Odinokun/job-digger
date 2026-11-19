import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { seedSystemUser } from "../db/system-user.ts";
import { testDb } from "../db/testing/test-db.ts";
import { careerSources, companies, users } from "../db/schema.ts";
import { addCompany } from "./add.ts";

async function user(): Promise<string> {
  return (await seedSystemUser(testDb)).id;
}

async function sourcesOf(companyId: string) {
  return testDb
    .select()
    .from(careerSources)
    .where(eq(careerSources.companyId, companyId));
}

/**
 * Чекає, поки вставка в `companies` із сусіднього зʼєднання стане в чергу за
 * блокуванням unique-індексу.
 *
 * Опитується `pg_stat_activity`, а не таймер: інакше тест міг би пройти через
 * дружню перевірку дублікатів і нічого не сказати про гонку. Запит іде поза
 * транзакцією - усередині транзакції статистика віддається з кешованого
 * знімка, у якому сусіднього зʼєднання ще немає.
 */
async function waitForBlockedInsert(): Promise<void> {
  const deadline = Date.now() + 8_000;

  while (Date.now() < deadline) {
    const blocked = await testDb.execute(
      sql`select 1 from pg_stat_activity
          where wait_event_type = 'Lock' and query ilike '%insert into "companies"%'`,
    );

    if (blocked.rows.length > 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error("The competing insert never waited for the unique index");
}

describe("addCompany", () => {
  it("saves the company together with its career page", async () => {
    const userId = await user();

    const result = await addCompany(testDb, {
      userId,
      name: "Spotify",
      url: "https://www.spotify.com",
      careerUrl: "https://jobs.lever.co/spotify",
    });

    expect(result).toEqual({ ok: true, companyId: expect.any(String) });
    if (!result.ok) return;

    const [company] = await testDb
      .select()
      .from(companies)
      .where(eq(companies.id, result.companyId));
    expect(company.name).toBe("Spotify");
    expect(company.url).toBe("https://www.spotify.com");
    // Очищена форма потрібна лише для порівняння дублікатів.
    expect(company.normalizedUrl).toBe("spotify.com");
    expect(company.discoveryStatus).toBe("not_checked");

    const sources = await sourcesOf(result.companyId);
    expect(sources).toHaveLength(1);
    // Платформу видно з адреси, тому джерело одразу відстежується.
    expect(sources[0].platform).toBe("lever");
    expect(sources[0].isTracked).toBe(true);
  });

  it("stores an address typed without a scheme as an absolute one", async () => {
    const userId = await user();

    const result = await addCompany(testDb, {
      userId,
      name: "GitLab",
      url: "about.gitlab.com",
      careerUrl: "job-boards.greenhouse.io/gitlab",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [company] = await testDb
      .select()
      .from(companies)
      .where(eq(companies.id, result.companyId));
    // Інакше посилання в списку компаній було б відносним і вело в нікуди.
    expect(company.url).toBe("https://about.gitlab.com");
    expect((await sourcesOf(result.companyId))[0].url).toBe(
      "https://job-boards.greenhouse.io/gitlab",
    );
  });

  it("keeps a career page we cannot read without tracking it", async () => {
    const userId = await user();

    const result = await addCompany(testDb, {
      userId,
      name: "Spotify",
      url: "https://www.spotify.com",
      careerUrl: "https://www.lifeatspotify.com/jobs",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [source] = await sourcesOf(result.companyId);
    expect(source.platform).toBe("unsupported");
    expect(source.isTracked).toBe(false);
  });

  it("saves a company without a career page at all", async () => {
    const userId = await user();

    const result = await addCompany(testDb, {
      userId,
      name: "Berkshire Hathaway",
      url: "https://www.berkshirehathaway.com",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(await sourcesOf(result.companyId)).toHaveLength(0);
    const [company] = await testDb
      .select()
      .from(companies)
      .where(eq(companies.id, result.companyId));
    // Пошуку сторінок ще не було, тому Not checked, а не Not found.
    expect(company.discoveryStatus).toBe("not_checked");
  });

  it("treats a blank career page as none", async () => {
    const userId = await user();

    const result = await addCompany(testDb, {
      userId,
      name: "Valve",
      url: "https://www.valvesoftware.com",
      careerUrl: "   ",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await sourcesOf(result.companyId)).toHaveLength(0);
  });

  it("refuses a blank name", async () => {
    const userId = await user();

    const result = await addCompany(testDb, {
      userId,
      name: "   ",
      url: "https://www.valvesoftware.com",
    });

    expect(result).toEqual({ ok: false, problem: "name-required" });
    expect(await testDb.select().from(companies)).toHaveLength(0);
  });

  it("trims the name, because the database refuses a blank one", async () => {
    const userId = await user();

    const result = await addCompany(testDb, {
      userId,
      name: "  Valve  ",
      url: "https://www.valvesoftware.com",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [company] = await testDb
      .select()
      .from(companies)
      .where(eq(companies.id, result.companyId));
    expect(company.name).toBe("Valve");
  });

  it("refuses a company address it cannot use", async () => {
    const userId = await user();

    expect(
      await addCompany(testDb, { userId, name: "Valve", url: "не адреса" }),
    ).toEqual({ ok: false, problem: "company-url", reason: "not-a-url" });
    expect(
      await addCompany(testDb, {
        userId,
        name: "Valve",
        url: "ftp://valvesoftware.com",
      }),
    ).toEqual({
      ok: false,
      problem: "company-url",
      reason: "unsupported-scheme",
    });
  });

  it("saves nothing when the career address is unusable", async () => {
    const userId = await user();

    const result = await addCompany(testDb, {
      userId,
      name: "Valve",
      url: "https://www.valvesoftware.com",
      careerUrl: "javascript:alert(1)",
    });

    expect(result).toEqual({
      ok: false,
      problem: "career-url",
      reason: "unsupported-scheme",
    });
    // Перевірка адрес іде перед вставкою, інакше лишилася б компанія без джерела.
    expect(await testDb.select().from(companies)).toHaveLength(0);
  });

  it("refuses a company that is already added", async () => {
    const userId = await user();
    await addCompany(testDb, {
      userId,
      name: "Spotify",
      url: "https://www.spotify.com",
    });

    const result = await addCompany(testDb, {
      userId,
      name: "Spotify again",
      // Та сама компанія, інакше записана: www і слеш нічого не змінюють.
      url: "spotify.com/",
    });

    expect(result).toMatchObject({
      ok: false,
      problem: "already-added",
      company: { name: "Spotify", url: "https://www.spotify.com" },
    });
    expect(await testDb.select().from(companies)).toHaveLength(1);
  });

  it("warns about other companies on the same domain instead of saving", async () => {
    const userId = await user();
    await addCompany(testDb, {
      userId,
      name: "Bosch DE",
      url: "https://www.bosch.com/de",
    });

    const result = await addCompany(testDb, {
      userId,
      name: "Bosch UA",
      url: "https://www.bosch.com/ua",
    });

    expect(result).toMatchObject({
      ok: false,
      problem: "same-domain",
      companies: [{ name: "Bosch DE" }],
    });
    expect(await testDb.select().from(companies)).toHaveLength(1);
  });

  it("saves once the same-domain warning is confirmed", async () => {
    const userId = await user();
    await addCompany(testDb, {
      userId,
      name: "Bosch DE",
      url: "https://www.bosch.com/de",
    });

    const result = await addCompany(testDb, {
      userId,
      name: "Bosch UA",
      url: "https://www.bosch.com/ua",
      confirmed: true,
    });

    expect(result.ok).toBe(true);
    expect(await testDb.select().from(companies)).toHaveLength(2);
  });

  it("does not let a confirmation push through an exact duplicate", async () => {
    const userId = await user();
    await addCompany(testDb, {
      userId,
      name: "Spotify",
      url: "https://www.spotify.com",
    });

    const result = await addCompany(testDb, {
      userId,
      name: "Spotify again",
      url: "https://www.spotify.com",
      confirmed: true,
    });

    expect(result).toMatchObject({ ok: false, problem: "already-added" });
    expect(await testDb.select().from(companies)).toHaveLength(1);
  });

  it("falls back to the unique index when a parallel request wins the race", async () => {
    const userId = await user();
    // Окреме зʼєднання грає роль іншого запиту - свого чи іншого користувача.
    const rival = await testDb.$client.connect();

    try {
      // Rival уже вставив компанію, але ще не закомітив: саме той момент,
      // якого дружня перевірка дублікатів побачити не може.
      await rival.query("begin");
      await rival.query(
        `insert into companies (user_id, name, url, normalized_url)
         values ($1, $2, $3, $4)`,
        [userId, "Spotify", "https://www.spotify.com", "spotify.com"],
      );

      const pending = addCompany(testDb, {
        userId,
        name: "Spotify",
        url: "https://www.spotify.com",
        careerUrl: "https://jobs.lever.co/spotify",
      });

      // Чекаємо саме на блокування, а не на таймер: без цього тест міг би
      // пройти через дружню перевірку й нічого не сказати про гонку.
      await waitForBlockedInsert();
      await rival.query("commit");

      expect(await pending).toMatchObject({
        ok: false,
        problem: "already-added",
        company: { name: "Spotify" },
      });
      expect(await testDb.select().from(companies)).toHaveLength(1);
      // Друга спроба не лишила по собі осиротілого джерела.
      expect(await testDb.select().from(careerSources)).toHaveLength(0);
    } finally {
      await rival.query("rollback").catch(() => undefined);
      rival.release();
    }
  });

  it("does not see a company of another user as a conflict", async () => {
    const owner = await user();
    const [stranger] = await testDb
      .insert(users)
      .values({ email: "stranger@job-digger.local" })
      .returning();
    await addCompany(testDb, {
      userId: stranger.id,
      name: "Spotify",
      url: "https://www.spotify.com",
    });

    const result = await addCompany(testDb, {
      userId: owner,
      name: "Spotify",
      url: "https://www.spotify.com",
    });

    // Дані ізольовані за користувачем, тому це не дублікат.
    expect(result.ok).toBe(true);
    expect(await testDb.select().from(companies)).toHaveLength(2);
  });

  it("adds a company found only on an ATS page, without a site", async () => {
    const userId = await user();

    const result = await addCompany(testDb, {
      userId,
      name: "Spotify",
      url: "",
      careerUrl: "jobs.lever.co/spotify",
    });

    expect(result.ok).toBe(true);

    const [company] = await testDb.select().from(companies);

    // Сайту немає в обох колонках: і в тій, що показується, і в тій, що
    // служить порівнянню. Компанію далі ідентифікує її джерело.
    expect(company.url).toBeNull();
    expect(company.normalizedUrl).toBeNull();

    const [source] = await sourcesOf(company.id);

    expect(source.url).toBe("https://jobs.lever.co/spotify");
    expect(source.platform).toBe("lever");
  });

  it("refuses a company with neither a site nor a career page", async () => {
    const userId = await user();

    const result = await addCompany(testDb, {
      userId,
      name: "Spotify",
      url: "   ",
      careerUrl: "",
    });

    // Без жодної адреси компанію не ідентифікує ніщо й перевіряти в неї нічого.
    expect(result).toEqual({ ok: false, problem: "address-required" });
    expect(await testDb.select().from(companies)).toHaveLength(0);
  });

  it("still refuses a site it cannot use, even though a site is optional now", async () => {
    const userId = await user();

    const result = await addCompany(testDb, {
      userId,
      name: "Spotify",
      url: "ftp://spotify.com",
      careerUrl: "jobs.lever.co/spotify",
    });

    expect(result).toEqual({
      ok: false,
      problem: "company-url",
      reason: "unsupported-scheme",
    });
    expect(await testDb.select().from(companies)).toHaveLength(0);
  });

  it("lets two companies without a site live side by side", async () => {
    const userId = await user();

    await addCompany(testDb, {
      userId,
      name: "Spotify",
      url: "",
      careerUrl: "jobs.lever.co/spotify",
    });

    const result = await addCompany(testDb, {
      userId,
      name: "Netflix",
      url: "",
      careerUrl: "jobs.lever.co/netflix",
    });

    // Unique-індекс `(user_id, normalized_url)` на двох NULL не спрацьовує:
    // у PostgreSQL NULL не дорівнює NULL (docs/18/indexes-unique).
    expect(result.ok).toBe(true);
    expect(await testDb.select().from(companies)).toHaveLength(2);
  });

  it("refuses a career page that already belongs to another company", async () => {
    const userId = await user();

    await addCompany(testDb, {
      userId,
      name: "Spotify",
      url: "",
      careerUrl: "jobs.lever.co/spotify",
    });

    const result = await addCompany(testDb, {
      userId,
      name: "Spotify Technology",
      url: "",
      // Та сама сторінка, записана інакше: порівняння йде по очищеній формі.
      careerUrl: "https://www.jobs.lever.co/spotify/",
    });

    // Саме це тримає від двійників компанію, яку нічим більше не відрізнити:
    // без сайту карʼєрна сторінка - уся її ідентичність (картка 2.17).
    expect(result).toMatchObject({
      ok: false,
      problem: "source-taken",
      company: { name: "Spotify" },
    });
    expect(await testDb.select().from(companies)).toHaveLength(1);
  });

  it("warns about a company with the same name instead of saving", async () => {
    const userId = await user();

    await addCompany(testDb, {
      userId,
      name: "Linear",
      url: "",
      careerUrl: "jobs.ashbyhq.com/linear",
    });

    const result = await addCompany(testDb, {
      userId,
      name: "Linear",
      url: "linear.app",
    });

    // Спільної адреси в цих двох карток немає взагалі: в однієї лише джерело,
    // в іншої лише сайт. Збігається тільки назва - і це єдиний сигнал, що це
    // та сама компанія (картка 2.17).
    expect(result).toMatchObject({
      ok: false,
      problem: "same-name",
      companies: [{ name: "Linear" }],
    });
    expect(await testDb.select().from(companies)).toHaveLength(1);
  });

  it("saves once the same-name warning is confirmed", async () => {
    const userId = await user();

    await addCompany(testDb, {
      userId,
      name: "Linear",
      url: "",
      careerUrl: "jobs.ashbyhq.com/linear",
    });

    const result = await addCompany(testDb, {
      userId,
      name: "Linear",
      url: "linear.app",
      confirmed: true,
    });

    // Дві різні компанії можуть називатися однаково, тому це попередження, а
    // не заборона.
    expect(result.ok).toBe(true);
    expect(await testDb.select().from(companies)).toHaveLength(2);
  });

  it("does not let a confirmation push through an exact duplicate", async () => {
    const userId = await user();

    await addCompany(testDb, { userId, name: "Bosch", url: "bosch.com" });

    const result = await addCompany(testDb, {
      userId,
      name: "Bosch",
      url: "bosch.com",
      confirmed: true,
    });

    // Точний збіг адреси підтвердженням не пробивається - ні цим, ні тим, що
    // проходить попередження про домен.
    expect(result).toMatchObject({ ok: false, problem: "already-added" });
  });

  it("does not warn about a name taken by another user", async () => {
    const owner = await user();
    const [stranger] = await testDb
      .insert(users)
      .values({ email: "stranger@job-digger.local" })
      .returning();

    await addCompany(testDb, {
      userId: stranger.id,
      name: "Linear",
      url: "linear.app",
    });

    const result = await addCompany(testDb, {
      userId: owner,
      name: "Linear",
      url: "",
      careerUrl: "jobs.ashbyhq.com/linear",
    });

    expect(result.ok).toBe(true);
  });

  describe("with pages found by Find pages", () => {
    it("saves every chosen page together with the typed one", async () => {
      const userId = await user();

      const result = await addCompany(testDb, {
        userId,
        name: "Spotify",
        url: "https://www.spotify.com",
        careerUrl: "jobs.lever.co/spotify",
        // Та сама дошка, що й у полі, - одне джерело, а не два.
        foundUrls: [
          "https://jobs.lever.co/spotify",
          "https://job-boards.greenhouse.io/spotify",
        ],
      });

      expect(result).toEqual({ ok: true, companyId: expect.any(String) });
      if (!result.ok) return;

      const sources = await sourcesOf(result.companyId);
      expect(
        sources.map(({ url, platform, isTracked }) => ({
          url,
          platform,
          isTracked,
        })),
      ).toEqual([
        {
          url: "https://jobs.lever.co/spotify",
          platform: "lever",
          isTracked: true,
        },
        {
          url: "https://job-boards.greenhouse.io/spotify",
          platform: "greenhouse",
          isTracked: true,
        },
      ]);
    });

    it("takes a found page as the address of a company without a site", async () => {
      const userId = await user();

      const result = await addCompany(testDb, {
        userId,
        name: "Linear",
        url: "",
        foundUrls: ["https://jobs.ashbyhq.com/linear"],
      });

      expect(result).toEqual({ ok: true, companyId: expect.any(String) });
    });

    it("refuses a found page that already belongs to another company", async () => {
      const userId = await user();
      await addCompany(testDb, {
        userId,
        name: "Spotify",
        url: "",
        careerUrl: "jobs.lever.co/spotify",
      });

      const result = await addCompany(testDb, {
        userId,
        name: "Spotify AB",
        url: "https://www.spotify.com",
        foundUrls: ["https://jobs.lever.co/spotify"],
      });

      expect(result).toMatchObject({
        ok: false,
        problem: "source-taken",
        company: { name: "Spotify" },
      });
      expect(await testDb.select().from(companies)).toHaveLength(1);
    });

    it("refuses a found address it cannot use", async () => {
      // Знахідки приходять із клієнта, тож перевіряються так само, як поле.
      const userId = await user();

      const result = await addCompany(testDb, {
        userId,
        name: "Acme",
        url: "https://acme.example",
        foundUrls: ["ftp://acme.example/jobs"],
      });

      expect(result).toEqual({
        ok: false,
        problem: "career-url",
        reason: "unsupported-scheme",
      });
      expect(await testDb.select().from(companies)).toHaveLength(0);
    });
  });
});
