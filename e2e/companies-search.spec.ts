import { expect, test, type Page } from "@playwright/test";

import { companyCard } from "./locators.ts";

/**
 * Searching companies by name on the All tab (task companies-search).
 *
 * Companies are added with a site only: without a career page they live on Not
 * tracked, and the app goes nowhere. The names are unique, so companies from other
 * scenarios in the E2E database do not get in the way.
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

  // The magnifier opens the field, and the list narrows while the person types.
  await page.getByRole("button", { name: "Search companies" }).click();
  const field = page.getByRole("searchbox", { name: "Company name" });
  await expect(field).toBeFocused();
  await field.fill("ALPHA");

  await expect(companyCard(page, "Beta Search")).toHaveCount(0);
  await expect(companyCard(page, "Alpha Search")).toBeVisible();
  await expect(page).toHaveURL(/[?&]q=ALPHA/);

  // The search in the address survives a reload.
  await page.reload();
  await expect(field).toHaveValue("ALPHA");
  await expect(companyCard(page, "Beta Search")).toHaveCount(0);

  // Nothing found - the page says what exactly is missing.
  await field.fill("zzz-search");
  await expect(
    page.getByText("No company name contains “zzz-search”."),
  ).toBeVisible();

  // The cross closes the search and brings back the whole list.
  await page.getByRole("button", { name: "Close search" }).click();
  await expect(field).toHaveCount(0);
  await expect(companyCard(page, "Beta Search")).toBeVisible();
  await expect(companyCard(page, "Alpha Search")).toBeVisible();
});
