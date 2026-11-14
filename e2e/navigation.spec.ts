import { expect, test } from "@playwright/test";

// Сценарій-заглушка каркаса E2E: застосунок відкривається і показує меню.
// Елементи шукаємо за роллю й доступним іменем, а не за класами Tailwind:
// класи змінює верстка, роль і назва - це те, що бачить користувач.
// https://playwright.dev/docs/locators#locate-by-role
test("opens the app and shows the main navigation", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Job Digger" })).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Main" });
  for (const section of ["Jobs", "Companies", "History", "Settings"]) {
    await expect(nav.getByRole("link", { name: section })).toBeVisible();
  }
});
