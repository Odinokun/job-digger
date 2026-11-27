import { expect, test } from "@playwright/test";

import { resetDatabase } from "./database.ts";
import { companyCard } from "./locators.ts";

/**
 * An own career page by recipe (task 6.21): a page nothing can read becomes a
 * vacancy list when a person confirms which links on it are vacancies.
 *
 * `kinggroup.io/vacancies/tech` is the real kinggroup page on Framer, saved in the
 * fake web server (src/server/http/testing): 10 vacancies as `./design/<slug>` links.
 */

test.beforeAll(resetDatabase);

test("an own career page is read as a list after the user confirms its links", async ({
  page,
}) => {
  // After the confirmation the company's first check runs.
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

  // Nothing can read the page - the company is on Not tracked.
  await page
    .getByRole("navigation", { name: "Company lists" })
    .getByRole("link", { name: /^Not tracked/ })
    .click();
  const card = companyCard(page, "Kinggroup");
  await card.getByRole("button", { name: "Read as list" }).click();

  // The dialog shows what it found on the page: a group of 10 links and the titles.
  const dialog = page.getByRole("dialog", { name: "Read the page as a list" });
  const group = dialog.getByRole("radio", { name: "10 links" });
  await expect(group).toBeChecked({ timeout: 15_000 });
  await expect(dialog).toContainText("DevOps Engineer");

  await dialog.getByRole("button", { name: "Read these" }).click();
  await expect(dialog).toBeHidden();

  // The company left Not tracked - the card disappears at once, without a reload.
  // Before, it stayed with the unread page note, even though the tab counts had
  // already updated.
  await expect(card).toBeHidden();

  // The company is tracked now, and the first check brings vacancies.
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
