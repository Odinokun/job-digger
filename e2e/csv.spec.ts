import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { companyCard } from "./locators.ts";

/**
 * CSV there and back (task 6.07) - the stage 6 scenario.
 *
 * Companies are brought in by import, then the whole list is exported with career
 * addresses, and the same file is imported back: nothing new appears, everything
 * is recognised as a duplicate, and the source labels survive the round trip.
 *
 * The companies are synthetic (`*.example`), and the fake web server does not know
 * `jobs.example` - the scenario reads nothing from the network, it only writes to
 * the database.
 */

const SOURCE_FILE = [
  "company_name,company_url,career_url,career_label",
  "Roundtrip One,roundtrip-one.example,https://job-boards.greenhouse.io/roundtrip-one,",
  'Roundtrip One,roundtrip-one.example,https://jobs.example/roundtrip-one?country=de,"Germany, remote"',
  "Roundtrip Two,roundtrip-two.example,,",
  "Roundtrip Three,roundtrip-three.example,https://jobs.lever.co/roundtrip-three,",
  "",
].join("\r\n");

/**
 * Only inside `main`: sometimes, right after navigation, the page also holds a
 * hidden copy of the whole Settings content outside `main` (seen in CI and
 * locally, cause not found), and strict mode refuses to act while a locator
 * matches two elements.
 */
function settings(page: Page) {
  return page.getByRole("main");
}

async function importFile(page: Page, name: string, contents: Buffer) {
  await settings(page).getByLabel("CSV file").setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: contents,
  });
  await page.getByRole("button", { name: "Import CSV" }).click();
}

/** The import summary. The page has several live regions - we take ours. */
function importSummary(page: Page) {
  return page.getByRole("status").filter({ hasText: "Added" });
}

/** The numbers in the Companies tabs - "Tracked (N)" and "Not tracked (N)". */
async function tabCounts(page: Page) {
  await page.goto("/companies");
  const tabs = page.getByRole("navigation", { name: "Company lists" });

  return {
    tracked: await tabs.getByRole("link", { name: /^Tracked/ }).innerText(),
    notTracked: await tabs
      .getByRole("link", { name: /^Not tracked/ })
      .innerText(),
  };
}

test("exports companies to CSV and imports the same file without duplicates", async ({
  page,
}) => {
  await page.goto("/settings");
  await importFile(page, "companies.csv", Buffer.from(SOURCE_FILE));
  await expect(importSummary(page)).toHaveText(
    "Added 3 companies and 3 career pages, skipped 0 duplicates, 0 rows with errors.",
  );

  const before = await tabCounts(page);
  // The source label made it: this is what the format has `career_label` for.
  await expect(
    companyCard(page, "Roundtrip One").getByText("Germany, remote"),
  ).toBeVisible();

  // Export of the whole list together with career addresses.
  await page.goto("/settings");
  await settings(page).getByText("Include career page URLs").click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export CSV" }).click(),
  ]);
  const exported = await readFile(await download.path());
  const lines = exported.toString("utf8").split("\r\n");
  expect(lines).toContain(
    'Roundtrip One,https://roundtrip-one.example,https://jobs.example/roundtrip-one?country=de,"Germany, remote"',
  );

  // The same file back: nothing new, no rows with errors.
  await importFile(page, "exported.csv", exported);
  await expect(importSummary(page)).toContainText(
    "Added 0 companies and 0 career pages",
  );
  await expect(importSummary(page)).toContainText("0 rows with errors");

  expect(await tabCounts(page)).toEqual(before);
});
