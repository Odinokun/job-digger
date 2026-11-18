import { expect, test } from "@playwright/test";

import { companyCard, vacancyRow } from "./locators.ts";

/**
 * Головний сценарій етапу 3 (задача 3.20): додав URL - бачиш вакансії.
 *
 * Критерій готовності етапу: написаний на його початку й був червоним, поки етап
 * не зроблено. Тег `@pending` зняла задача 3.16 - тепер це звичайний сценарій
 * і йде в CI.
 *
 * Справжній Greenhouse тут не викликається: застосунок іде на фейковий
 * вебсервер, який віддає збережену дошку Discord - 26 вакансій
 * (src/server/http/testing/README.md).
 */

const BOARD_URL = "job-boards.greenhouse.io/discord";
const BOARD_SIZE = 26;
const TITLE = "Account Executive, Mobile Gaming & Apps";

test("a Greenhouse board turns into unread vacancies that can be read and favorited", async ({
  page,
}) => {
  // Додавання: адреса дошки сама дає назву, Greenhouse підтримується.
  await page.goto("/companies");
  await page.getByRole("button", { name: "Add company" }).click();
  const addDialog = page.getByRole("dialog", { name: "Add company" });

  await addDialog.getByLabel("Company website").fill(BOARD_URL);
  await addDialog.getByLabel("Company website").blur();
  await expect(addDialog.getByLabel("Company name")).toHaveValue("Discord");

  await addDialog.getByRole("button", { name: "Save" }).click();
  await expect(addDialog).toBeHidden();

  await page
    .getByRole("navigation", { name: "Company lists" })
    .getByRole("link", { name: /^Tracked/ })
    .click();
  const card = companyCard(page, "Discord");
  await expect(card).toBeVisible();

  // Перевірка однієї компанії. Завершення видно за часом останньої перевірки.
  await card.getByRole("button", { name: "Check now" }).click();
  await expect(card.getByText(/Last checked/)).toBeVisible();

  // Unread: уся дошка, кожна вакансія з назвою компанії.
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: /^Jobs/ })
    .click();
  await expect(
    page.locator('a[href^="https://job-boards.greenhouse.io/discord/jobs/"]'),
  ).toHaveCount(BOARD_SIZE);
  await expect(vacancyRow(page, TITLE)).toContainText("Discord");

  // Дії над рядком доходять до сервера із запізненням: вкладку перемикаємо,
  // поки дія ще не записала позначку в базу. Рядок зникає з Unread одразу
  // (оптимістично), тож людина цілком може так зробити, - і на CI тест без
  // затримки падав через ту саму гонитву (задача 3.22).
  await page.route("**/*", async (route) => {
    if (route.request().headers()["next-action"] !== undefined) {
      await new Promise((done) => setTimeout(done, 1000));
    }
    await route.continue();
  });

  // Mark as read переносить вакансію з Unread у Read.
  await vacancyRow(page, TITLE)
    .getByRole("button", { name: "Mark as read" })
    .click();
  await expect(vacancyRow(page, TITLE)).toHaveCount(0);

  await page.getByRole("link", { name: /^Read/ }).click();
  await expect(vacancyRow(page, TITLE)).toBeVisible();

  // Favorite додає її у Favorites.
  await vacancyRow(page, TITLE)
    .getByRole("button", { name: "Favorite" })
    .click();

  await page.getByRole("link", { name: /^Favorites/ }).click();
  await expect(vacancyRow(page, TITLE)).toBeVisible();

  // Mark all as read: діалог називає, скільки вакансій позначить, - усі
  // непрочитані, крім уже прочитаної вище.
  await page.getByRole("link", { name: /^Unread/ }).click();
  await page.getByRole("button", { name: "Mark all as read" }).click();
  const confirmDialog = page.getByRole("alertdialog", {
    name: "Mark all as read?",
  });
  await expect(confirmDialog).toContainText(
    `Mark ${BOARD_SIZE - 1} vacancies in all companies as read?`,
  );

  await confirmDialog.getByRole("button", { name: "Mark as read" }).click();
  await expect(confirmDialog).toBeHidden();
  await expect(page.getByText("Everything is read.")).toBeVisible();

  await page.getByRole("link", { name: /^Read/ }).click();
  await expect(
    page.locator('a[href^="https://job-boards.greenhouse.io/discord/jobs/"]'),
  ).toHaveCount(BOARD_SIZE);
});
