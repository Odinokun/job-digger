import { expect, test } from "@playwright/test";

import { resetDatabase } from "./database.ts";

/**
 * Головний сценарій етапу 5 (задача 5.12): від головної адреси компанії до
 * вакансій у Unread через Find pages (docs/discovery-and-parsing.md, розділ 5).
 *
 * Критерій готовності етапу: написаний на його початку й червоний, поки етап
 * не зроблено, тому з тегом `@pending`. Тег знімає остання задача етапу.
 *
 * Сайт компанії - `acme.example` на фейковому вебсервері
 * (src/server/http/testing/README.md): головна сторінка з посиланням Careers на
 * дошку Lever `leverdemo`, збережену в етапі 3. Домен `.example` зарезервований
 * (RFC 2606), тож навіть без фейкового сервера запит нікуди б не пішов. Самої
 * сторінки ще немає - вона зʼявиться разом із пошуком посилань на ATS (5.02).
 */

const SITE = "acme.example";
const BOARD = { url: "jobs.lever.co/leverdemo", platform: "Lever", jobs: 10 };

test.beforeAll(resetDatabase);

test("Find pages turns a company site into tracked vacancies @pending", async ({
  page,
}) => {
  // Пошук обходить сайт і пробно читає знахідки, а потім іде перша
  // перевірка: типових 30 с може не вистачити.
  test.setTimeout(60_000);

  await page.goto("/companies");
  await page.getByRole("button", { name: "Add company" }).click();
  const dialog = page.getByRole("dialog", { name: "Add company" });

  await dialog.getByLabel("Company website").fill(SITE);
  await dialog.getByRole("button", { name: "Find pages" }).click();

  // Знахідки показуються вже пробно прочитаними: платформа, адреса і
  // кількість вакансій (розділ 5, пункт 5).
  const found = dialog
    .getByRole("list", { name: "Found pages" })
    .getByRole("listitem")
    .filter({ hasText: BOARD.url });
  await expect(found).toBeVisible({ timeout: 30_000 });
  await expect(found).toContainText(BOARD.platform);
  await expect(found).toContainText(`${BOARD.jobs} vacancies`);

  // Назву компанії пошук заповнює сам; її можна змінити.
  await expect(dialog.getByLabel("Company name")).not.toHaveValue("");

  // Джерело для відстеження вибирає користувач. Клік - по підпису, як
  // зробила б людина: сам `<input>` HeroUI ховає під намальованою галочкою, і
  // `check()` на ньому не дістає (перехоплює `checkbox__control`).
  await found.getByText(BOARD.url).click();
  await expect(found.getByRole("checkbox")).toBeChecked();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  // Save одразу запускає першу перевірку компанії (пункт 7): вакансії
  // зʼявляються без Check all.
  const jobsLink = page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: /^Jobs/ });
  await expect(jobsLink).toHaveText(`Jobs ${BOARD.jobs}`, { timeout: 30_000 });

  await jobsLink.click();
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(
    BOARD.jobs,
  );
});
