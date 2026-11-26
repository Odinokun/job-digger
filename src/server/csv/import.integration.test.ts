import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { careerSources, companies, users } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { normalizedSourceUrl } from "../db/testing/career-source-values.ts";
import { testDb } from "../db/testing/test-db.ts";
import type { CsvRow } from "./format.ts";
import { importCompanies } from "./import.ts";

function row(
  company_name: string,
  company_url: string,
  career_url = "",
  career_label = "",
): CsvRow {
  return { company_name, company_url, career_url, career_label };
}

async function companiesOf(userId: string) {
  const rows = await testDb
    .select()
    .from(companies)
    .where(eq(companies.userId, userId))
    .orderBy(companies.name);

  return Promise.all(
    rows.map(async (company) => ({
      name: company.name,
      url: company.url,
      discoveryStatus: company.discoveryStatus,
      sources: (
        await testDb
          .select()
          .from(careerSources)
          .where(eq(careerSources.companyId, company.id))
          .orderBy(careerSources.createdAt, careerSources.url)
      ).map((source) => ({
        url: source.url,
        label: source.label,
        platform: source.platform,
        isTracked: source.isTracked,
      })),
    })),
  );
}

async function existing(
  userId: string,
  name: string,
  url: string,
  sourceUrl?: string,
) {
  const [company] = await testDb
    .insert(companies)
    .values({
      userId,
      name,
      url: `https://${url}`,
      normalizedUrl: url,
    })
    .returning();

  if (sourceUrl !== undefined) {
    await testDb.insert(careerSources).values({
      companyId: company.id,
      url: sourceUrl,
      normalizedUrl: normalizedSourceUrl(sourceUrl),
      platform: "greenhouse",
    });
  }

  return company;
}

describe("importCompanies", () => {
  it("adds a company with its sources, labels and platforms", async () => {
    const user = await seedSystemUser(testDb);

    const summary = await importCompanies(testDb, {
      userId: user.id,
      rows: [
        row(
          "Mozilla",
          "mozilla.org",
          "https://job-boards.greenhouse.io/mozilla",
        ),
        row(
          "Mozilla",
          "https://mozilla.org",
          "https://mozilla.org/careers/listings?location=US",
          "USA",
        ),
      ],
    });

    expect(summary).toEqual({
      companiesAdded: 1,
      sourcesAdded: 2,
      duplicates: 0,
      errors: 0,
    });
    expect(await companiesOf(user.id)).toEqual([
      {
        name: "Mozilla",
        url: "https://mozilla.org",
        discoveryStatus: "not_checked",
        sources: [
          {
            url: "https://job-boards.greenhouse.io/mozilla",
            label: null,
            platform: "greenhouse",
            isTracked: true,
          },
          {
            url: "https://mozilla.org/careers/listings?location=US",
            label: "USA",
            platform: "unsupported",
            isTracked: false,
          },
        ],
      },
    ]);
  });

  it("adds a company without a career page as Not checked", async () => {
    const user = await seedSystemUser(testDb);

    const summary = await importCompanies(testDb, {
      userId: user.id,
      rows: [row("Acme", "acme.com")],
    });

    expect(summary).toMatchObject({ companiesAdded: 1, sourcesAdded: 0 });
    expect(await companiesOf(user.id)).toEqual([
      {
        name: "Acme",
        url: "https://acme.com",
        discoveryStatus: "not_checked",
        sources: [],
      },
    ]);
  });

  it("adds new pages to a company that exists, skipping known ones", async () => {
    const user = await seedSystemUser(testDb);
    await existing(
      user.id,
      "Acme",
      "acme.com",
      "https://job-boards.greenhouse.io/acme",
    );

    const summary = await importCompanies(testDb, {
      userId: user.id,
      rows: [
        row(
          "Acme Renamed",
          "www.acme.com",
          "https://job-boards.greenhouse.io/acme",
        ),
        row("Acme", "acme.com", "https://jobs.lever.co/acme"),
        row("Acme", "acme.com"),
      ],
    });

    expect(summary).toEqual({
      companiesAdded: 0,
      sourcesAdded: 1,
      duplicates: 2,
      errors: 0,
    });
    const [acme] = await companiesOf(user.id);
    // The name of an existing company stays: import does not rename.
    expect(acme.name).toBe("Acme");
    expect(acme.sources.map((source) => source.url)).toEqual([
      "https://job-boards.greenhouse.io/acme",
      "https://jobs.lever.co/acme",
    ]);
  });

  it("refuses a row without a company site (task company-site-required)", async () => {
    const user = await seedSystemUser(testDb);

    const summary = await importCompanies(testDb, {
      userId: user.id,
      rows: [row("Linear", "", "https://jobs.ashbyhq.com/linear")],
    });

    expect(summary).toEqual({
      companiesAdded: 0,
      sourcesAdded: 0,
      duplicates: 0,
      errors: 1,
    });
    expect(await testDb.select().from(companies)).toEqual([]);
  });

  it("counts rows repeated inside the file as duplicates", async () => {
    const user = await seedSystemUser(testDb);

    const summary = await importCompanies(testDb, {
      userId: user.id,
      rows: [
        row("Acme", "acme.com", "https://jobs.lever.co/acme"),
        row("Acme", "acme.com", "https://jobs.lever.co/acme/"),
        row("Beta", "beta.com", "https://jobs.lever.co/beta"),
        row("Beta", "beta.com", "https://jobs.lever.co/beta"),
      ],
    });

    expect(summary).toEqual({
      companiesAdded: 2,
      sourcesAdded: 2,
      duplicates: 2,
      errors: 0,
    });
  });

  it("skips a page that belongs to another company", async () => {
    const user = await seedSystemUser(testDb);
    await existing(
      user.id,
      "Acme",
      "acme.com",
      "https://job-boards.greenhouse.io/acme",
    );

    const summary = await importCompanies(testDb, {
      userId: user.id,
      rows: [
        row(
          "Acme Labs",
          "acmelabs.com",
          "https://job-boards.greenhouse.io/acme",
        ),
      ],
    });

    // The company is new, but its board is already at Acme - the source is not duplicated.
    expect(summary).toEqual({
      companiesAdded: 1,
      sourcesAdded: 0,
      duplicates: 1,
      errors: 0,
    });
  });

  it("counts broken rows as errors and imports the rest", async () => {
    const user = await seedSystemUser(testDb);

    const summary = await importCompanies(testDb, {
      userId: user.id,
      rows: [
        row("Acme", "ftp://acme.com"),
        row("Beta", "beta.io", "ftp://beta.io/jobs"),
        row("", "nameless.com"),
        row("Nowhere", ""),
        row("Gamma", "gamma.dev"),
      ],
    });

    expect(summary).toEqual({
      companiesAdded: 1,
      sourcesAdded: 0,
      duplicates: 0,
      errors: 4,
    });
    expect((await companiesOf(user.id)).map((company) => company.name)).toEqual(
      ["Gamma"],
    );
  });

  it("does not see another user's companies", async () => {
    const owner = await seedSystemUser(testDb);
    const [other] = await testDb
      .insert(users)
      .values({ email: "other@job-digger.local" })
      .returning();
    await existing(other.id, "Acme", "acme.com");

    const summary = await importCompanies(testDb, {
      userId: owner.id,
      rows: [row("Acme", "acme.com")],
    });

    expect(summary).toMatchObject({ companiesAdded: 1, duplicates: 0 });
  });
});
