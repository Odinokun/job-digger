import { expect, test } from "@playwright/test";

import { resetDatabase } from "./database.ts";

/**
 * Перевірка, що почалась уже після завантаження сторінки (задача 6.29):
 * автоперевірка за розкладом чи дія в іншій вкладці. Відкрита сторінка Jobs
 * має показати знайдені вакансії й лічильник без перезавантаження.
 *
 * Розклад у E2E вимкнений (`AUTO_CHECK=off` у playwright.config.ts), тож
 * перевірку запускає друга вкладка: Save нової компанії одразу її перевіряє
 * (задача 5.09). Повільне опитування раз на 60 с тест не чекає - він
 * «повертається» на вкладку подією `visibilitychange`, і опитувач питає
 * одразу. Дошка Lever - на фейковому вебсервері, справжні сайти не
 * викликаються.
 */

const LEVER = { url: "jobs.lever.co/leverdemo", name: "Lever Demo", jobs: 10 };

test.beforeAll(resetDatabase);

test("an open Jobs page shows vacancies found by a check started elsewhere", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);

  await page.goto("/");
  await expect(page.getByText("No vacancies yet.")).toBeVisible();
  const jobsLink = page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: /^Jobs/ });
  await expect(jobsLink).toHaveText("Jobs");

  const other = await context.newPage();
  await other.goto("/companies");
  await other.getByRole("button", { name: "Add company" }).click();
  const dialog = other.getByRole("dialog", { name: "Add company" });
  await dialog.getByLabel("Company website").fill(LEVER.url);
  await dialog.getByLabel("Company website").blur();
  await dialog.getByLabel("Company name").fill(LEVER.name);
  await dialog.getByLabel("Company website").fill("lever-demo.example");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  // Перевірка йде у фоні: «повертаємось» на першу вкладку, доки сервер не
  // скаже, що вакансії знайдено.
  await expect(async () => {
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await expect(jobsLink).toHaveText(`Jobs ${LEVER.jobs}`, { timeout: 2000 });
  }).toPass({ timeout: 30_000 });

  // Порожній список заповнився сам, без toast «new vacancies».
  await expect(page.getByText("No vacancies yet.")).toBeHidden();
  await expect(
    page.getByRole("main").getByRole("listitem").first(),
  ).toBeVisible();
  await expect(page.getByText(/new vacanc/i)).toBeHidden();
});
