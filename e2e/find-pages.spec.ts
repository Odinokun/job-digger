import { expect, test } from "@playwright/test";

import { resetDatabase } from "./database.ts";

/**
 * The main scenario of stage 5 (task 5.12): from a company's main address to
 * vacancies in Unread through Find pages (src/server/discovery/README.md).
 *
 * The stage's definition of done: written at its start and red until the stage was
 * finished. Task 5.11 removed the `@pending` tag - now it is an ordinary scenario.
 *
 * The company site is `acme.example` on the fake web server
 * (src/server/http/testing/README.md): a home page with a Careers link to the Lever
 * board `leverdemo`, saved in stage 3. The `.example` domain is reserved (RFC 2606),
 * so even without the fake server a request would go nowhere.
 */

const SITE = "acme.example";
const BOARD = { url: "jobs.lever.co/leverdemo", platform: "Lever", jobs: 10 };

test.beforeAll(resetDatabase);

test("Find pages turns a company site into tracked vacancies", async ({
  page,
}) => {
  // The search walks the site and trial-reads the findings, then the first check
  // runs: the default 30 s may not be enough.
  test.setTimeout(60_000);

  await page.goto("/companies");
  await page.getByRole("button", { name: "Add company" }).click();
  const dialog = page.getByRole("dialog", { name: "Add company" });

  await dialog.getByLabel("Company website").fill(SITE);
  await dialog.getByRole("button", { name: "Find pages" }).click();

  // Findings are shown already trial-read: the platform, the address and the
  // vacancy count.
  const found = dialog
    .getByRole("list", { name: "Found pages" })
    .getByRole("listitem")
    .filter({ hasText: BOARD.url });
  await expect(found).toBeVisible({ timeout: 30_000 });
  await expect(found).toContainText(BOARD.platform);
  await expect(found).toContainText(`${BOARD.jobs} vacancies`);

  // The search fills in the company name itself; it can be changed.
  await expect(dialog.getByLabel("Company name")).not.toHaveValue("");

  // A finding's address can be opened to check it before choosing (task 6.15): a
  // link in a new tab, outside the checkbox label.
  const link = found.getByRole("link", { name: BOARD.url });
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");

  // The user chooses the source to track. The click goes to the label, as a person
  // would do it: HeroUI hides the `<input>` itself under the drawn checkmark, and
  // `check()` on it does not get through (`checkbox__control` intercepts it).
  await found.getByText(BOARD.platform, { exact: true }).click();
  await expect(found.getByRole("checkbox")).toBeChecked();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  // Save starts the company's first check right away (item 7): vacancies appear
  // without Check all.
  const jobsLink = page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: /^Jobs/ });
  await expect(jobsLink).toHaveText(`Jobs ${BOARD.jobs}`, { timeout: 30_000 });

  await jobsLink.click();
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(
    BOARD.jobs,
  );
});
