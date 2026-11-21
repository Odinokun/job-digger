import { expect, test, type Page } from "@playwright/test";

import { resetDatabase } from "./database.ts";
import { companyCard } from "./locators.ts";

/**
 * Телефон (аудит інтерфейсу, A1): на 390 px жодна сторінка не ширша за екран,
 * а меню ховається за бургер. Раніше меню в шапці й картка з довгою адресою
 * розпирали сторінку до 413-484 px, і вона скролилась убік.
 *
 * Довга адреса з фільтрами - як у справжніх джерел (mozilla.org, Sigma): вона
 * має обрізатись «…» усередині картки, а не тягнути картку за край.
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

  // Компанія з довгою кар'єрною сторінкою, яку нічим прочитати: вона живе на
  // Not tracked і показує адресу в картці.
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

  // Меню шапки на телефоні не видно - лише бургер; перехід закриває панель.
  await expect(
    page.getByRole("navigation", { name: "Main" }).first(),
  ).toBeHidden();
  await page.getByRole("button", { name: "Menu" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await menu.getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(menu).toBeHidden();
});
