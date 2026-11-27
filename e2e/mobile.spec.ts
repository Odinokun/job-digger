import { expect, test, type Page } from "@playwright/test";

import { resetDatabase } from "./database.ts";
import { companyCard } from "./locators.ts";

/**
 * Phone (UI audit, A1): at 390 px no page is wider than the screen, and the menu
 * hides behind a burger. Before, the header menu and a card with a long address
 * stretched the page to 413-484 px, and it scrolled sideways.
 *
 * A long address with filters, like real sources have (mozilla.org, Sigma): it has
 * to be cut with "…" inside the card rather than pull the card past the edge.
 */

test.use({ viewport: { width: 390, height: 844 } });
test.beforeAll(resetDatabase);

const LONG_CAREER_PAGE =
  "acme.example/careers/listings/?direction=engineering&location=north-america%2Ceurope&seniority=senior%2Clead&workplace=remote";

async function expectNoSideScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

test("no page scrolls sideways on a phone, and the menu opens from the burger", async ({
  page,
}) => {
  await page.goto("/companies");

  // A company with a long career page nothing can read: it lives on Not tracked and
  // shows the address on the card.
  await page.getByRole("button", { name: "Add company" }).click();
  const addDialog = page.getByRole("dialog", { name: "Add company" });
  await addDialog.getByLabel("Company website").fill("acme.example");
  await addDialog.getByLabel("Company name").fill("Acme");
  await addDialog.getByLabel("Career page").fill(LONG_CAREER_PAGE);
  await addDialog.getByRole("button", { name: "Save" }).click();
  await expect(addDialog).toBeHidden();

  await page.goto("/companies?tab=not-tracked");
  await expect(companyCard(page, "Acme")).toBeVisible();
  await expectNoSideScroll(page);

  for (const path of ["/", "/companies", "/history", "/settings"]) {
    await page.goto(path);
    await expectNoSideScroll(page);
  }

  // The header menu is not visible on a phone - only the burger; navigating closes the panel.
  await expect(
    page.getByRole("navigation", { name: "Main" }).first(),
  ).toBeHidden();
  await page.getByRole("button", { name: "Menu" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await menu.getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(menu).toBeHidden();
});
