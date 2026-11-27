import { expect, test } from "@playwright/test";

// A placeholder scenario of the E2E scaffold: the app opens and shows the menu.
// Elements are found by role and accessible name, not by Tailwind classes: the
// markup changes classes, while the role and name are what the user sees.
// https://playwright.dev/docs/locators#locate-by-role
test("opens the app and shows the main navigation", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Job Digger" })).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Main" });
  for (const section of ["Jobs", "Companies", "History", "Settings"]) {
    await expect(nav.getByRole("link", { name: section })).toBeVisible();
  }
});
