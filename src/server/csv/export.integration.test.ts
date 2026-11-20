import { describe, expect, it } from "vitest";

import { careerSources, companies, users } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { normalizedSourceUrl } from "../db/testing/career-source-values.ts";
import { testDb } from "../db/testing/test-db.ts";
import { exportCompanyRows } from "./export.ts";

async function company(
  userId: string,
  name: string,
  url: string | null,
  sources: { url: string; label?: string; isTracked?: boolean }[] = [],
) {
  const [row] = await testDb
    .insert(companies)
    .values({ userId, name, url, normalizedUrl: url })
    .returning();

  for (const source of sources) {
    await testDb.insert(careerSources).values({
      companyId: row.id,
      url: source.url,
      normalizedUrl: normalizedSourceUrl(source.url),
      label: source.label ?? null,
      platform: source.isTracked === false ? "unsupported" : "greenhouse",
      isTracked: source.isTracked ?? true,
    });
  }
}

/** Mozilla - Tracked із двома джерелами, Acme - Not tracked без джерел. */
async function seed() {
  const user = await seedSystemUser(testDb);
  await company(user.id, "Mozilla", "https://mozilla.org", [
    { url: "https://job-boards.greenhouse.io/mozilla" },
    {
      url: "https://mozilla.org/careers/listings?location=US",
      label: "USA",
      isTracked: false,
    },
  ]);
  await company(user.id, "Acme", "https://acme.com");

  return user;
}

describe("exportCompanyRows", () => {
  it("writes one row per company without career URLs", async () => {
    const user = await seed();

    expect(
      await exportCompanyRows(testDb, {
        userId: user.id,
        tracked: true,
        notTracked: true,
        careerUrls: false,
      }),
    ).toEqual([
      {
        company_name: "Acme",
        company_url: "https://acme.com",
        career_url: "",
        career_label: "",
      },
      {
        company_name: "Mozilla",
        company_url: "https://mozilla.org",
        career_url: "",
        career_label: "",
      },
    ]);
  });

  it("writes a row per source with career URLs, keeping labels", async () => {
    // Джерело, яке ми не читаємо, теж експортується: адреса знадобиться,
    // коли зʼявиться парсер.
    const user = await seed();

    expect(
      await exportCompanyRows(testDb, {
        userId: user.id,
        tracked: true,
        notTracked: true,
        careerUrls: true,
      }),
    ).toEqual([
      {
        company_name: "Acme",
        company_url: "https://acme.com",
        career_url: "",
        career_label: "",
      },
      {
        company_name: "Mozilla",
        company_url: "https://mozilla.org",
        career_url: "https://job-boards.greenhouse.io/mozilla",
        career_label: "",
      },
      {
        company_name: "Mozilla",
        company_url: "https://mozilla.org",
        career_url: "https://mozilla.org/careers/listings?location=US",
        career_label: "USA",
      },
    ]);
  });

  it("takes only the chosen lists", async () => {
    const user = await seed();
    const names = async (tracked: boolean, notTracked: boolean) =>
      (
        await exportCompanyRows(testDb, {
          userId: user.id,
          tracked,
          notTracked,
          careerUrls: false,
        })
      ).map((row) => row.company_name);

    expect(await names(true, false)).toEqual(["Mozilla"]);
    expect(await names(false, true)).toEqual(["Acme"]);
    expect(await names(false, false)).toEqual([]);
  });

  it("leaves company_url empty for a company known only by its board", async () => {
    const user = await seedSystemUser(testDb);
    await company(user.id, "Linear", null, [
      { url: "https://jobs.ashbyhq.com/linear" },
    ]);

    expect(
      await exportCompanyRows(testDb, {
        userId: user.id,
        tracked: true,
        notTracked: true,
        careerUrls: true,
      }),
    ).toEqual([
      {
        company_name: "Linear",
        company_url: "",
        career_url: "https://jobs.ashbyhq.com/linear",
        career_label: "",
      },
    ]);
  });

  it("never exports another user's companies", async () => {
    const owner = await seedSystemUser(testDb);
    const [other] = await testDb
      .insert(users)
      .values({ email: "other@job-digger.local" })
      .returning();
    await company(other.id, "Acme", "https://acme.com");

    expect(
      await exportCompanyRows(testDb, {
        userId: owner.id,
        tracked: true,
        notTracked: true,
        careerUrls: true,
      }),
    ).toEqual([]);
  });
});
