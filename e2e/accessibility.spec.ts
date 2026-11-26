import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { resetDatabase } from "./database.ts";
import { companyCard } from "./locators.ts";

/**
 * Доступність за WCAG 2.2 AA (задача accessibility-audit).
 *
 * axe перевіряє кожну сторінку з даними у світлій і темній темах. Теги -
 * критерії рівнів A і AA усіх версій WCAG 2.x: рівень AA включає A, а нові
 * версії додають критерії до старих.
 * https://playwright.dev/docs/accessibility-testing
 *
 * Автоматика ловить лише частину проблем (порядок фокусу, зміст оголошень
 * читача екрана вона не оцінює) - решта перевіряється руками, чекліст у
 * tasks/accessibility-audit.md.
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

async function expectNoViolations(page: Page, name: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_AA_TAGS)
    .analyze();

  // Лише суть кожного порушення: правило і де саме, без повного звіту axe.
  // Soft, щоб один прогін показав усі сторінки, а не першу з порушенням.
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
  // Дані для сторінок: компанія з дошкою Greenhouse на фейковому сервері дає
  // вакансії, картку на Tracked і запис в History.
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

  // Обрана вакансія: на Favorites axe бачить її стан.
  await page.goto("/");
  await page.getByRole("button", { name: "Favorite" }).first().click();
  await expect(
    page.getByRole("button", { name: "Remove from Favorites" }),
  ).toBeVisible();

  // Сторінка, яку нічим прочитати: картка на Not tracked показує підпис
  // Unsupported page помаранчевим текстом.
  await page.goto("/companies");
  await page.getByRole("button", { name: "Add company" }).click();
  await dialog.getByLabel("Company website").fill("acme.example");
  await dialog.getByLabel("Company name").fill("Acme");
  await dialog.getByLabel("Career page").fill("acme.example/careers");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  await page.close();
});

// Один тест на всі сторінки, а не тест на сторінку: після падіння тесту
// Playwright перезапускає воркер і `beforeAll` наповнював би базу вдруге.
test("every page has no WCAG A/AA violations in both themes", async ({
  page,
}) => {
  test.slow();

  for (const colorScheme of ["light", "dark"] as const) {
    // Без cookie `theme` застосунок іде за темою системи.
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
      // Модалка зʼявляється з анімацією прозорості, і посеред неї axe бачить
      // текст майже кольору фону (1.2:1) - хибне порушення контрасту.
      await page.waitForFunction(() =>
        document
          .getAnimations()
          .every((animation) => animation.playState !== "running"),
      );
      await expectNoViolations(page, `${colorScheme} Add company dialog`);
    });
  }
});
