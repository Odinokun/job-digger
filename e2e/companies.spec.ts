import { expect, test } from "@playwright/test";

import { companyCard } from "./locators.ts";

/**
 * Повний шлях компанії: додати, відредагувати, видалити.
 *
 * Завершальний сценарій етапу 2. Додавання починається з однієї адреси
 * (картка 2.12): вставлена кар'єрна сторінка сама розкладається на сайт,
 * назву й кар'єрну сторінку.
 *
 * `bosch.com/de/careers/jobs` - не ATS, тому джерело отримує платформу
 * «Unsupported page», а компанія живе на вкладці Not tracked.
 *
 * База E2E чиститься перед прогоном (`e2e/global-setup.ts`), тож Bosch тут
 * не зустрінеться з однойменною компанією і не викличе попередження про дублікат.
 */

test("adds a company from one address, edits it and deletes it", async ({
  page,
}) => {
  await page.goto("/companies");

  // Додавання: одна вставлена адреса заповнює решту полів.
  await page.getByRole("button", { name: "Add company" }).click();
  const addDialog = page.getByRole("dialog", { name: "Add company" });

  await addDialog
    .getByLabel("Company website")
    .fill("bosch.com/de/careers/jobs");
  // Підказка спрацьовує, коли поле адреси втрачає фокус.
  await addDialog.getByLabel("Company website").blur();

  await expect(addDialog.getByLabel("Company website")).toHaveValue(
    "bosch.com",
  );
  await expect(addDialog.getByLabel("Company name")).toHaveValue("Bosch");
  await expect(addDialog.getByLabel("Career page")).toHaveValue(
    "bosch.com/de/careers/jobs",
  );

  await addDialog.getByRole("button", { name: "Save" }).click();
  await expect(addDialog).toBeHidden();

  await page
    .getByRole("navigation", { name: "Company lists" })
    .getByRole("link", { name: "Not tracked" })
    .click();
  await expect(companyCard(page, "Bosch")).toBeVisible();

  // Редагування: нова назва видна на картці.
  await companyCard(page, "Bosch")
    .getByRole("button", { name: "Edit" })
    .click();
  const editDialog = page.getByRole("dialog", { name: "Edit company" });

  await editDialog.getByLabel("Company name").fill("Bosch Group");
  await editDialog.getByRole("button", { name: "Save" }).click();
  await expect(editDialog).toBeHidden();

  await expect(companyCard(page, "Bosch Group")).toBeVisible();
  await expect(companyCard(page, "Bosch")).toHaveCount(0);

  // Видалення - лише після підтвердження.
  await companyCard(page, "Bosch Group")
    .getByRole("button", { name: "Delete company" })
    .click();
  const deleteDialog = page.getByRole("alertdialog", {
    name: "Delete this company?",
  });
  await deleteDialog.getByRole("button", { name: "Delete" }).click();
  await expect(deleteDialog).toBeHidden();

  await expect(companyCard(page, "Bosch Group")).toHaveCount(0);
});
