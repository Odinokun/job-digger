import { expect, test } from "@playwright/test";

import { resetDatabase } from "./database.ts";

/**
 * A check that started after the page loaded (task 6.29): a scheduled auto-check
 * or an action in another tab. An open Jobs page has to show the vacancies found and
 * the counter without a reload.
 *
 * The schedule is off in E2E (`AUTO_CHECK=off` in playwright.config.ts), so a second
 * tab starts the check: Save of a new company checks it right away (task 5.09). The
 * test does not wait for the slow 60 s poll - it "comes back" to the tab with a
 * `visibilitychange` event, and the poller asks right away. The Lever board is on
 * the fake web server; real sites are not called.
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

  // The check runs in the background: we "come back" to the first tab until the
  // server says the vacancies are found.
  await expect(async () => {
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await expect(jobsLink).toHaveText(`Jobs ${LEVER.jobs}`, { timeout: 2000 });
  }).toPass({ timeout: 30_000 });

  // The empty list filled itself, without a "new vacancies" toast.
  await expect(page.getByText("No vacancies yet.")).toBeHidden();
  await expect(
    page.getByRole("main").getByRole("listitem").first(),
  ).toBeVisible();
  await expect(page.getByText(/new vacanc/i)).toBeHidden();
});
