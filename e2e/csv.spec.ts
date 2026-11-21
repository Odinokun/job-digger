import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { companyCard } from "./locators.ts";

/**
 * CSV туди й назад (задача 6.07) - сценарій етапу 6.
 *
 * Компанії заводяться імпортом, тоді весь список експортується з карʼєрними
 * адресами, і той самий файл імпортується назад: нічого нового не
 * зʼявляється, усе впізнається як дублікат, а підписи джерел переживають
 * дорогу.
 *
 * Компанії синтетичні (`*.example`), а `jobs.example` фейковий вебсервер не
 * знає - сценарій нічого не читає з мережі, лише пише в базу.
 */

const SOURCE_FILE = [
  "company_name,company_url,career_url,career_label",
  "Roundtrip One,roundtrip-one.example,https://job-boards.greenhouse.io/roundtrip-one,",
  'Roundtrip One,roundtrip-one.example,https://jobs.example/roundtrip-one?country=de,"Germany, remote"',
  "Roundtrip Two,roundtrip-two.example,,",
  "Roundtrip Three,roundtrip-three.example,https://jobs.lever.co/roundtrip-three,",
  "",
].join("\r\n");

async function importFile(page: Page, name: string, contents: Buffer) {
  await page.getByLabel("CSV file").setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: contents,
  });
  await page.getByRole("button", { name: "Import CSV" }).click();
}

/** Підсумок імпорту. Живих регіонів на сторінці кілька - беремо свій. */
function importSummary(page: Page) {
  return page.getByRole("status").filter({ hasText: "Added" });
}

/** Числа у вкладках Companies - «Tracked (N)» і «Not tracked (N)». */
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
  // Підпис джерела доїхав: саме для цього формат має `career_label`.
  await expect(
    companyCard(page, "Roundtrip One").getByText("Germany, remote"),
  ).toBeVisible();

  // Експорт усього списку разом із карʼєрними адресами.
  await page.goto("/settings");
  await page.getByText("Include career page URLs").click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export CSV" }).click(),
  ]);
  const exported = await readFile(await download.path());
  const lines = exported.toString("utf8").split("\r\n");
  expect(lines).toContain(
    'Roundtrip One,https://roundtrip-one.example,https://jobs.example/roundtrip-one?country=de,"Germany, remote"',
  );

  // Той самий файл назад: нового нічого, рядків із помилкою немає.
  await importFile(page, "exported.csv", exported);
  await expect(importSummary(page)).toContainText(
    "Added 0 companies and 0 career pages",
  );
  await expect(importSummary(page)).toContainText("0 rows with errors");

  expect(await tabCounts(page)).toEqual(before);
});
