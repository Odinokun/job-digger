import { expect, test } from "@playwright/test";

import { companyCard } from "./locators.ts";

/**
 * The full path of a company: add, edit, delete.
 *
 * The final scenario of stage 2. Adding starts from one address (card 2.12): a
 * pasted career page splits itself into the site, the name and the career page.
 *
 * `bosch.com/de/careers/jobs` is not an ATS, so the source gets the "Unsupported
 * page" platform, and the company lives on the Not tracked tab.
 *
 * The E2E database is cleared before the run (`e2e/global-setup.ts`), so Bosch does
 * not meet a company with the same name here and does not trigger a duplicate warning.
 */

test("adds a company from one address, edits it and deletes it", async ({
  page,
}) => {
  await page.goto("/companies");

  // Adding: one pasted address fills in the other fields.
  await page.getByRole("button", { name: "Add company" }).click();
  const addDialog = page.getByRole("dialog", { name: "Add company" });

  await addDialog
    .getByLabel("Company website")
    .fill("bosch.com/de/careers/jobs");
  // The suggestion fires when the address field loses focus.
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

  // Editing: the new name is visible on the card.
  await companyCard(page, "Bosch")
    .getByRole("button", { name: "Edit" })
    .click();
  const editDialog = page.getByRole("dialog", { name: "Edit company" });

  await editDialog.getByLabel("Company name").fill("Bosch Group");
  await editDialog.getByRole("button", { name: "Save" }).click();
  await expect(editDialog).toBeHidden();

  await expect(companyCard(page, "Bosch Group")).toBeVisible();
  await expect(companyCard(page, "Bosch")).toHaveCount(0);

  // "Link only" (task 6.17): the person marks a page nothing can read themselves,
  // and it stops counting as unread. The click goes to the label: HeroUI hides the
  // `<input>` itself under the drawn checkmark.
  const card = companyCard(page, "Bosch Group");
  await expect(card).toContainText("1 page not read");
  await card.getByText("Link only", { exact: true }).click();
  await expect(card.getByRole("checkbox", { name: "Link only" })).toBeChecked();
  await expect(card).not.toContainText("page not read");

  await page.reload();
  await expect(
    companyCard(page, "Bosch Group").getByRole("checkbox", {
      name: "Link only",
    }),
  ).toBeChecked();

  // Deleting - only after confirmation.
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

// Task 6.12: the name suggestion arrives when the address field loses focus - that
// is, exactly when focus moves to the name field. Typing right after the click was
// appended to the suggestion ("AcmeAcme Corp").
test("a name typed right after the address replaces the suggestion", async ({
  page,
}) => {
  await page.goto("/companies");
  await page.getByRole("button", { name: "Add company" }).click();
  const addDialog = page.getByRole("dialog", { name: "Add company" });

  await addDialog.getByLabel("Company website").fill("https://acme.example");
  await addDialog.getByLabel("Company name").click();
  await page.keyboard.type("Acme Corp");

  await expect(addDialog.getByLabel("Company name")).toHaveValue("Acme Corp");
});
