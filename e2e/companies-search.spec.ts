import { expect, test, type Page } from "@playwright/test";

import { companyCard } from "./locators.ts";

/**
 * Пошук компанії за назвою на вкладці All (задача companies-search).
 *
 * Компанії додаються лише з сайтом: без кар'єрної сторінки вони живуть на Not
 * tracked, і застосунок нікуди не ходить. Назви унікальні, тож компанії з
 * інших сценаріїв у базі E2E перевірці не заважають.
 */

async function addCompany(page: Page, site: string, name: string) {
  await page.getByRole("button", { name: "Add company" }).click();
  const dialog = page.getByRole("dialog", { name: "Add company" });

  await dialog.getByLabel("Company website").fill(site);
  await dialog.getByLabel("Company name").fill(name);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
}

test("finds a company by name on the All tab", async ({ page }) => {
  await page.goto("/companies");
  await addCompany(page, "alpha-search.example", "Alpha Search");
  await addCompany(page, "beta-search.example", "Beta Search");

  await page
    .getByRole("navigation", { name: "Company lists" })
    .getByRole("link", { name: /^All/ })
    .click();
  await expect(companyCard(page, "Alpha Search")).toBeVisible();
  await expect(companyCard(page, "Beta Search")).toBeVisible();

  // Лупа відкриває поле, і список звужується, поки людина друкує.
  await page.getByRole("button", { name: "Search companies" }).click();
  const field = page.getByRole("searchbox", { name: "Company name" });
  await expect(field).toBeFocused();
  await field.fill("ALPHA");

  await expect(companyCard(page, "Beta Search")).toHaveCount(0);
  await expect(companyCard(page, "Alpha Search")).toBeVisible();
  await expect(page).toHaveURL(/[?&]q=ALPHA/);

  // Пошук в адресі переживає перезавантаження.
  await page.reload();
  await expect(field).toHaveValue("ALPHA");
  await expect(companyCard(page, "Beta Search")).toHaveCount(0);

  // Нічого не знайшлося - сторінка каже, чого саме немає.
  await field.fill("zzz-search");
  await expect(
    page.getByText("No company name contains “zzz-search”."),
  ).toBeVisible();

  // Хрестик закриває пошук і повертає весь список.
  await page.getByRole("button", { name: "Close search" }).click();
  await expect(field).toHaveCount(0);
  await expect(companyCard(page, "Beta Search")).toBeVisible();
  await expect(companyCard(page, "Alpha Search")).toBeVisible();
});
