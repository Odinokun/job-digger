import { expect, test } from "@playwright/test";

import { resetDatabase } from "./database.ts";
import { companyCard, vacancyRow } from "./locators.ts";

/**
 * The main scenario of stage 3 (task 3.20): add a URL - see vacancies.
 *
 * The stage's definition of done: written at its start and red until the stage was
 * finished. Task 3.16 removed the `@pending` tag - now it is an ordinary scenario
 * and runs in CI.
 *
 * The real Greenhouse is not called here: the app goes to the fake web server, which
 * serves the saved Discord board - 26 vacancies (src/server/http/testing/README.md).
 */

const BOARD_URL = "job-boards.greenhouse.io/discord";
const BOARD_SIZE = 26;
const TITLE = "Account Executive, Mobile Gaming & Apps";

// The unread counter counts all companies: other vacancies would spoil the numbers.
test.beforeAll(resetDatabase);

test("a Greenhouse board turns into unread vacancies that can be read and favorited", async ({
  page,
}) => {
  // Adding: the board address gives the name itself, Greenhouse is supported.
  await page.goto("/companies");
  await page.getByRole("button", { name: "Add company" }).click();
  const addDialog = page.getByRole("dialog", { name: "Add company" });

  await addDialog.getByLabel("Company website").fill(BOARD_URL);
  await addDialog.getByLabel("Company website").blur();
  await expect(addDialog.getByLabel("Company name")).toHaveValue("Discord");

  // A board link fills in the career page and the name but not the company site, and
  // without it Save is disabled (task company-site-required).
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

  // The first check starts by itself right after Save (task 5.09). Its end is visible
  // by the last check time.
  await expect(card.getByText(/Last checked/)).toBeVisible({ timeout: 15_000 });

  // The unread counter is in the menu next to Jobs and in the browser tab title.
  const jobsLink = page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: /^Jobs/ });
  await expect(jobsLink).toHaveText(`Jobs ${BOARD_SIZE}`);
  await expect(page).toHaveTitle(`(${BOARD_SIZE}) Job Digger`);

  // Unread: the whole board, each vacancy with the company name.
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: /^Jobs/ })
    .click();
  await expect(
    page.locator('a[href^="https://job-boards.greenhouse.io/discord/jobs/"]'),
  ).toHaveCount(BOARD_SIZE);
  await expect(vacancyRow(page, TITLE)).toContainText("Discord");

  // The numbers in the tabs - how many rows each has (task jobs-tab-counts).
  const tabs = page.getByRole("navigation", { name: "Job lists" });
  await expect(tabs).toHaveText(
    `Unread (${BOARD_SIZE})Read (0)Favorites (0)All (${BOARD_SIZE})`,
  );

  // Row actions reach the server with a delay: we switch the tab while the action
  // has not yet written the mark to the database. The row leaves Unread at once
  // (optimistically), so a person may well do this - and on CI the test without a
  // delay failed because of that very race (task 3.22).
  await page.route("**/*", async (route) => {
    if (route.request().headers()["next-action"] !== undefined) {
      await new Promise((done) => setTimeout(done, 1000));
    }
    await route.continue();
  });

  // Mark as read moves the vacancy from Unread to Read.
  await vacancyRow(page, TITLE)
    .getByRole("button", { name: "Mark as read" })
    .click();
  await expect(vacancyRow(page, TITLE)).toHaveCount(0);
  // The tab numbers move together with the row, even before the server response,
  // which the route above delays by a second.
  await expect(tabs).toHaveText(
    `Unread (${BOARD_SIZE - 1})Read (1)Favorites (0)All (${BOARD_SIZE})`,
    { timeout: 500 },
  );
  await expect(jobsLink).toHaveText(`Jobs ${BOARD_SIZE - 1}`);

  // Undo returns the vacancy to its place in Unread (task vacancy-undo-toast).
  const undoNotice = page
    .getByRole("alertdialog")
    .filter({ hasText: "Marked as read" });
  await expect(undoNotice).toContainText(TITLE);
  await undoNotice.getByRole("button", { name: "Undo" }).click();
  await expect(vacancyRow(page, TITLE)).toBeVisible();
  await expect(tabs).toHaveText(
    `Unread (${BOARD_SIZE})Read (0)Favorites (0)All (${BOARD_SIZE})`,
  );
  await expect(undoNotice).toHaveCount(0);

  // Mark as read again - the scenario continues with the vacancy read.
  await vacancyRow(page, TITLE)
    .getByRole("button", { name: "Mark as read" })
    .click();
  await expect(vacancyRow(page, TITLE)).toHaveCount(0);
  await expect(jobsLink).toHaveText(`Jobs ${BOARD_SIZE - 1}`);

  await page.getByRole("link", { name: /^Read/ }).click();
  await expect(vacancyRow(page, TITLE)).toBeVisible();

  // Favorite adds it to Favorites.
  await vacancyRow(page, TITLE)
    .getByRole("button", { name: "Favorite" })
    .click();

  await page.getByRole("link", { name: /^Favorites/ }).click();
  await expect(vacancyRow(page, TITLE)).toBeVisible();
  // Just added - in the recent favorites group (task favorites-added-today).
  await expect(
    page.getByRole("heading", { name: "Last 12 hours" }),
  ).toBeVisible();
  await expect(tabs.getByRole("link", { name: /^Favorites/ })).toHaveText(
    "Favorites (1)",
  );

  // Mark all as read: the dialog names how many vacancies it will mark - all unread
  // ones except the one already read above.
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
  // No unread left - no number in the menu or in the tab title.
  await expect(jobsLink).toHaveText("Jobs");
  await expect(page).toHaveTitle("Job Digger");

  await page.getByRole("link", { name: /^Read/ }).click();
  await expect(
    page.locator('a[href^="https://job-boards.greenhouse.io/discord/jobs/"]'),
  ).toHaveCount(BOARD_SIZE);

  // Mark all as unread on the company card returns all its vacancies to Unread.
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: /^Companies/ })
    .click();
  await page
    .getByRole("navigation", { name: "Company lists" })
    .getByRole("link", { name: /^Tracked/ })
    .click();
  // An icon-only button names its action in a tooltip on hover.
  const markUnread = companyCard(page, "Discord").getByRole("button", {
    name: "Mark all as unread",
  });
  await markUnread.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Mark all as unread");

  await markUnread.click();
  await expect(
    page.getByText(`${BOARD_SIZE} vacancies of Discord marked as unread.`),
  ).toBeVisible();
  // The header counter updates even without going to Jobs.
  await expect(jobsLink).toHaveText(`Jobs ${BOARD_SIZE}`);

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: /^Jobs/ })
    .click();
  await expect(
    page.locator('a[href^="https://job-boards.greenhouse.io/discord/jobs/"]'),
  ).toHaveCount(BOARD_SIZE);

  // Mark all as unread on the Read tab (task 6.18): a mirror of Mark all as read, also
  // through a dialog with the count.
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
