import { expect, test } from "@playwright/test";

import { resetDatabase } from "./database.ts";
import { companyCard } from "./locators.ts";

/**
 * Власна кар'єрна сторінка за рецептом (задача 6.21): сторінка, яку нічим
 * прочитати, стає списком вакансій, коли людина підтверджує, які посилання на
 * ній - вакансії.
 *
 * `kinggroup.io/vacancies/tech` - справжня сторінка kinggroup на Framer,
 * збережена у фейковому вебсервері (src/server/http/testing): 10 вакансій
 * посиланнями `./design/<slug>`.
 */

test.beforeAll(resetDatabase);

test("an own career page is read as a list after the user confirms its links", async ({
  page,
}) => {
  // Після підтвердження йде перша перевірка компанії.
  test.setTimeout(60_000);

  await page.goto("/companies");
  await page.getByRole("button", { name: "Add company" }).click();
  const addDialog = page.getByRole("dialog", { name: "Add company" });
  await addDialog
    .getByLabel("Company website")
    .fill("kinggroup.io/vacancies/tech");
  await addDialog.getByLabel("Company website").blur();
  await expect(addDialog.getByLabel("Career page")).toHaveValue(
    "kinggroup.io/vacancies/tech",
  );
  await addDialog.getByRole("button", { name: "Save" }).click();
  await expect(addDialog).toBeHidden();

  // Сторінку нічим прочитати - компанія в Not tracked.
  await page
    .getByRole("navigation", { name: "Company lists" })
    .getByRole("link", { name: /^Not tracked/ })
    .click();
  const card = companyCard(page, "Kinggroup");
  await card.getByRole("button", { name: "Read as list" }).click();

  // Діалог показує, що знайшов на сторінці: група з 10 посилань і назви.
  const dialog = page.getByRole("dialog", { name: "Read the page as a list" });
  const group = dialog.getByRole("radio", { name: "10 links" });
  await expect(group).toBeChecked({ timeout: 15_000 });
  await expect(dialog).toContainText("DevOps Engineer");

  await dialog.getByRole("button", { name: "Read these" }).click();
  await expect(dialog).toBeHidden();

  // Компанія тепер відстежується, і перша перевірка приносить вакансії.
  const jobsLink = page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: /^Jobs/ });
  await expect(jobsLink).toHaveText("Jobs 10", { timeout: 30_000 });

  await jobsLink.click();
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(10);
  await expect(
    page.getByRole("link", { name: "React Native developer" }),
  ).toHaveAttribute(
    "href",
    "https://kinggroup.io/vacancies/design/react-native-developer",
  );
});
