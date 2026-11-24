import { expect, test } from "@playwright/test";

import { resetDatabase } from "./database.ts";
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

// Лічильник непрочитаних рахує всі компанії: чужі вакансії зіпсували б числа.
test.beforeAll(resetDatabase);

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

  // Посилання на дошку заповнює кар'єрну сторінку й назву, а сайт компанії -
  // ні, і без нього Save неактивна (задача company-site-required).
  await expect(addDialog.getByLabel("Company website")).toHaveValue("");
  await expect(addDialog.getByRole("button", { name: "Save" })).toBeDisabled();
  await addDialog.getByLabel("Company website").fill("discord.com");

  await addDialog.getByRole("button", { name: "Save" }).click();
  await expect(addDialog).toBeHidden();

  await page
    .getByRole("navigation", { name: "Company lists" })
    .getByRole("link", { name: /^Tracked/ })
    .click();
  const card = companyCard(page, "Discord");
  await expect(card).toBeVisible();

  // Перша перевірка стартує сама одразу після Save (задача 5.09). Завершення
  // видно за часом останньої перевірки.
  await expect(card.getByText(/Last checked/)).toBeVisible({ timeout: 15_000 });

  // Лічильник непрочитаних - у меню біля Jobs і в назві вкладки браузера.
  const jobsLink = page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: /^Jobs/ });
  await expect(jobsLink).toHaveText(`Jobs ${BOARD_SIZE}`);
  await expect(page).toHaveTitle(`(${BOARD_SIZE}) Job Digger`);

  // Unread: уся дошка, кожна вакансія з назвою компанії.
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: /^Jobs/ })
    .click();
  await expect(
    page.locator('a[href^="https://job-boards.greenhouse.io/discord/jobs/"]'),
  ).toHaveCount(BOARD_SIZE);
  await expect(vacancyRow(page, TITLE)).toContainText("Discord");

  // Числа у вкладках - скільки рядків у кожній (задача jobs-tab-counts).
  const tabs = page.getByRole("navigation", { name: "Job lists" });
  await expect(tabs).toHaveText(
    `Unread (${BOARD_SIZE})Read (0)Favorites (0)All (${BOARD_SIZE})`,
  );

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
  // Числа вкладок рухаються разом із рядком, ще до відповіді сервера, яку
  // маршрут вище затримує на секунду.
  await expect(tabs).toHaveText(
    `Unread (${BOARD_SIZE - 1})Read (1)Favorites (0)All (${BOARD_SIZE})`,
    { timeout: 500 },
  );
  await expect(jobsLink).toHaveText(`Jobs ${BOARD_SIZE - 1}`);

  await page.getByRole("link", { name: /^Read/ }).click();
  await expect(vacancyRow(page, TITLE)).toBeVisible();

  // Favorite додає її у Favorites.
  await vacancyRow(page, TITLE)
    .getByRole("button", { name: "Favorite" })
    .click();

  await page.getByRole("link", { name: /^Favorites/ }).click();
  await expect(vacancyRow(page, TITLE)).toBeVisible();
  await expect(tabs.getByRole("link", { name: /^Favorites/ })).toHaveText(
    "Favorites (1)",
  );

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
  await expect(tabs).toHaveText(
    `Unread (0)Read (${BOARD_SIZE})Favorites (1)All (${BOARD_SIZE})`,
  );
  // Непрочитаних немає - числа немає ні в меню, ні в назві вкладки.
  await expect(jobsLink).toHaveText("Jobs");
  await expect(page).toHaveTitle("Job Digger");

  await page.getByRole("link", { name: /^Read/ }).click();
  await expect(
    page.locator('a[href^="https://job-boards.greenhouse.io/discord/jobs/"]'),
  ).toHaveCount(BOARD_SIZE);

  // Mark all as unread у картці компанії повертає всі її вакансії в Unread.
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: /^Companies/ })
    .click();
  await page
    .getByRole("navigation", { name: "Company lists" })
    .getByRole("link", { name: /^Tracked/ })
    .click();
  // Кнопка лише з іконкою називає дію підказкою при наведенні.
  const markUnread = companyCard(page, "Discord").getByRole("button", {
    name: "Mark all as unread",
  });
  await markUnread.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Mark all as unread");

  await markUnread.click();
  await expect(
    page.getByText(`${BOARD_SIZE} vacancies of Discord marked as unread.`),
  ).toBeVisible();
  // Лічильник у шапці оновлюється й без переходу на Jobs.
  await expect(jobsLink).toHaveText(`Jobs ${BOARD_SIZE}`);

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: /^Jobs/ })
    .click();
  await expect(
    page.locator('a[href^="https://job-boards.greenhouse.io/discord/jobs/"]'),
  ).toHaveCount(BOARD_SIZE);

  // Mark all as unread у вкладці Read (задача 6.18): дзеркало Mark all as read,
  // теж через діалог із кількістю.
  await vacancyRow(page, TITLE)
    .getByRole("button", { name: "Mark as read" })
    .click();
  await expect(jobsLink).toHaveText(`Jobs ${BOARD_SIZE - 1}`);

  await page.getByRole("link", { name: /^Read/ }).click();
  await page.getByRole("button", { name: "Mark all as unread" }).click();
  const unreadDialog = page.getByRole("alertdialog", {
    name: "Mark all as unread?",
  });
  await expect(unreadDialog).toContainText(
    "Return 1 vacancy in all companies to Unread?",
  );

  await unreadDialog.getByRole("button", { name: "Mark as unread" }).click();
  await expect(unreadDialog).toBeHidden();
  await expect(page.getByText("Nothing read yet.")).toBeVisible();
  await expect(jobsLink).toHaveText(`Jobs ${BOARD_SIZE}`);
});
