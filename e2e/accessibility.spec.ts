import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { resetDatabase } from "./database.ts";
import { companyCard } from "./locators.ts";

/**
 * Accessibility per WCAG 2.2 AA (task accessibility-audit).
 *
 * axe checks every page with data in the light and dark themes. The tags are the
 * level A and AA criteria of all WCAG 2.x versions: level AA includes A, and newer
 * versions add criteria to the older ones.
 * https://playwright.dev/docs/accessibility-testing
 *
 * Automation catches only part of the problems (it does not judge focus order or
 * what a screen reader announces) - the rest is checked by hand, with the checklist
 * in tasks/accessibility-audit.md.
 */

const WCAG_AA_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22a",
  "wcag22aa",
];

const PAGES = [
  "/",
  "/?tab=read",
  "/?tab=favorites",
  "/?tab=all",
  "/companies",
  "/companies?tab=not-tracked",
  "/companies?tab=attention",
  "/companies?tab=all",
  "/history",
  "/settings",
];

/**
 * Rules outside WCAG (best practice in axe) that we keep anyway: `heading-order` -
 * headings without skipping a level, which Lighthouse counts too (task 6.29). In a
 * separate run: this way the WCAG check stays exactly the set the tags define.
 */
const EXTRA_RULES = ["heading-order"];

async function expectNoViolations(page: Page, name: string): Promise<void> {
  const [wcag, extra] = [
    await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze(),
    await new AxeBuilder({ page }).withRules(EXTRA_RULES).analyze(),
  ];
  const violations = [...wcag.violations, ...extra.violations];

  // Only the gist of each violation: the rule and where exactly, without the full axe report.
  // Soft, so one run shows all pages, not just the first one with a violation.
  expect
    .soft(
      violations.map((violation) => ({
        rule: violation.id,
        nodes: violation.nodes.map((node) => node.target.join(" ")),
      })),
      name,
    )
    .toEqual([]);
}

test.beforeAll(resetDatabase);

test.beforeAll(async ({ browser }) => {
  // Data for the pages: a company with a Greenhouse board on the fake server gives
  // vacancies, a card on Tracked and a History entry.
  const page = await browser.newPage();

  await page.goto("/companies");
  await page.getByRole("button", { name: "Add company" }).click();
  const dialog = page.getByRole("dialog", { name: "Add company" });
  await dialog.getByLabel("Company website").fill("discord.com");
  await dialog.getByLabel("Company name").fill("Discord");
  await dialog
    .getByLabel("Career page")
    .fill("job-boards.greenhouse.io/discord");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  await page.goto("/companies");
  await expect(
    companyCard(page, "Discord").getByText(/Last checked/),
  ).toBeVisible({ timeout: 15_000 });

  // A favorite vacancy: on Favorites axe sees its state.
  await page.goto("/");
  await page.getByRole("button", { name: "Favorite" }).first().click();
  await expect(
    page.getByRole("button", { name: "Remove from Favorites" }),
  ).toBeVisible();

  // A page nothing can read: the card on Not tracked shows the Unsupported page
  // label as orange text.
  await page.goto("/companies");
  await page.getByRole("button", { name: "Add company" }).click();
  await dialog.getByLabel("Company website").fill("acme.example");
  await dialog.getByLabel("Company name").fill("Acme");
  await dialog.getByLabel("Career page").fill("acme.example/careers");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  await page.close();
});

// One test for all pages, not a test per page: after a failed test Playwright
// restarts the worker, and `beforeAll` would fill the database a second time.
test("every page has no WCAG A/AA violations in both themes", async ({
  page,
}) => {
  test.slow();

  for (const colorScheme of ["light", "dark"] as const) {
    // Without the `theme` cookie the app follows the system theme.
    await page.emulateMedia({ colorScheme });

    for (const path of PAGES) {
      await test.step(`${colorScheme} ${path}`, async () => {
        await page.goto(path);
        await expectNoViolations(page, `${colorScheme} ${path}`);
      });
    }

    await test.step(`${colorScheme} Add company dialog`, async () => {
      await page.goto("/companies");
      await page.getByRole("button", { name: "Add company" }).click();
      await expect(
        page.getByRole("dialog", { name: "Add company" }),
      ).toBeVisible();
      // The modal appears with an opacity animation, and midway axe sees text
      // almost the colour of the background (1.2:1) - a false contrast violation.
      await page.waitForFunction(() =>
        document
          .getAnimations()
          .every((animation) => animation.playState !== "running"),
      );
      await expectNoViolations(page, `${colorScheme} Add company dialog`);
    });
  }
});
