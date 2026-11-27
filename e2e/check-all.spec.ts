import { expect, type Page, test } from "@playwright/test";

import { resetDatabase } from "./database.ts";

/**
 * The main scenario of stage 4 (task 4.11): Check all from start to summary.
 *
 * The stage's definition of done: written at its start and red until the stage was
 * finished. Task 4.10 removed the `@pending` tag - now it is an ordinary scenario.
 *
 * Three companies on the fake web server (src/server/http/testing/README.md): two
 * can be read, the third is a Greenhouse board the server does not have, so its
 * source fails with a 404. Real sites are not called.
 */

const LEVER = { url: "jobs.lever.co/leverdemo", name: "Lever Demo", jobs: 10 };
const PEOPLEFORCE = {
  url: "team.peopleforce.io/careers",
  name: "PeopleForce",
  jobs: 6,
};
const BROKEN = { url: "job-boards.greenhouse.io/ghost", name: "Ghost" };

const SOURCES = 3;
/**
 * Vacancies of both boards. The first check, which starts right after Save
 * (task 5.09), already finds them, so for Check all itself they are not new.
 */
const VACANCIES = LEVER.jobs + PEOPLEFORCE.jobs;

// Check all counts all companies on Tracked: other companies would spoil the numbers.
test.beforeAll(resetDatabase);

async function addCompany(
  page: Page,
  company: { url: string; name: string },
): Promise<void> {
  await page.getByRole("button", { name: "Add company" }).click();
  const dialog = page.getByRole("dialog", { name: "Add company" });

  await dialog.getByLabel("Company website").fill(company.url);
  // The suggestion splits the address into fields when the field loses focus; then
  // we set our own name, so as not to depend on what the suggestion makes of it.
  await dialog.getByLabel("Company website").blur();
  await dialog.getByLabel("Company name").fill(company.name);
  // The suggestion moved the board address into the career page, and the company
  // site is required - we enter it ourselves.
  await dialog
    .getByLabel("Company website")
    .fill(`${company.name.toLowerCase().replaceAll(" ", "-")}.example`);

  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
}

test("Check all checks every tracked source and reports the failed one", async ({
  page,
}) => {
  // The default 30 s is not enough: three additions, the check itself and polling
  // every few seconds until the summary pops up.
  test.setTimeout(60_000);

  await page.goto("/companies");
  for (const company of [LEVER, PEOPLEFORCE, BROKEN]) {
    await addCompany(page, company);
  }

  // All three are on Tracked: the Ghost source is tracked, even though it is broken.
  const tracked = page
    .getByRole("navigation", { name: "Company lists" })
    .getByRole("link", { name: /^Tracked/ });
  await tracked.click();
  await expect(tracked).toContainText("3");

  // The first checks after Save have to finish before Check all: otherwise two
  // checks of the same sources race each other, and the summary numbers are random.
  const jobsLink = page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: /^Jobs/ });
  await expect(jobsLink).toHaveText(`Jobs ${VACANCIES}`, { timeout: 30_000 });

  // The start. The indicator appears at once from the Check all response, not from
  // the first poll, so it is visible even though the fake server answers instantly.
  await page.getByRole("button", { name: "Check all" }).click();
  await expect(
    page.getByRole("banner").getByText(new RegExp(`Checking \\d+/${SOURCES}`)),
  ).toBeVisible();

  // The summary pops up by itself, without a page reload. A HeroUI toast is an
  // `alertdialog` named by its title; the `role="alert"` inside wraps only the text,
  // and the action button sits next to it.
  const summary = page.getByRole("alertdialog", { name: "Check finished" });
  await expect(summary).toBeVisible({ timeout: 30_000 });
  await expect(summary).toContainText(`${SOURCES} sources checked`);
  await expect(summary).toContainText(`${SOURCES - 1} ok`);
  await expect(summary).toContainText("1 failed");
  // The first check already found the vacancies - Check all sees no new ones.
  await expect(summary).toContainText("0 new");
  await expect(summary).toContainText("0 removed");
  await expect(page.getByRole("banner").getByText(/Checking/)).toBeHidden();

  // The counter next to Jobs is the same: the same vacancies, nothing disappeared.
  await expect(jobsLink).toHaveText(`Jobs ${VACANCIES}`);

  // The failed source is in the Failed Sources Drawer, and only it.
  await summary.getByRole("button", { name: "Show failed sources" }).click();
  const drawer = page.getByRole("dialog", { name: "Failed sources" });
  await expect(drawer.getByRole("listitem")).toHaveCount(1);
  const failed = drawer.getByRole("listitem").filter({ hasText: BROKEN.name });
  await expect(failed).toContainText(BROKEN.url);

  // Retry: the board still does not exist, so the source fails again and stays in
  // the list, and the drawer does not close.
  await failed.getByRole("button", { name: "Retry" }).click();
  await expect(drawer.getByRole("listitem")).toHaveCount(1);
  await expect(failed).toContainText(BROKEN.url);
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();

  // History: one row per general check. Retry does not change it and does not add
  // a new one.
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "History" })
    .click();
  const runs = page.getByRole("table", { name: "Check history" });
  const rows = runs.getByRole("rowgroup").last().getByRole("row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first().getByRole("cell").nth(1)).toHaveText(
    String(SOURCES),
  );
  await expect(rows.first().getByRole("cell").nth(2)).toHaveText("0");
  await expect(rows.first().getByRole("cell").nth(3)).toHaveText("0");
});
