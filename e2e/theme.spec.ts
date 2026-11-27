import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Switching the appearance.
 *
 * The scenario does not just check the final theme, it **counts `data-theme`
 * changes**. The bug that caused it did not break the final state: the theme managed
 * to switch on and back, because two owners held the attribute - React, which
 * rendered it from the cookie, and the client switcher. On screen this was a flicker,
 * and in the console an error about a `<script>` that appeared during a client
 * render. A "final state" check let all of this through.
 */

/** Starts watching `data-theme` changes on `<html>`. */
async function watchThemeChanges(page: Page): Promise<void> {
  await page.evaluate(() => {
    const changes: (string | null)[] = [];

    (window as unknown as { themeChanges: (string | null)[] }).themeChanges =
      changes;

    new MutationObserver(() => {
      changes.push(document.documentElement.getAttribute("data-theme"));
    }).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  });
}

async function themeChanges(page: Page): Promise<(string | null)[]> {
  return page.evaluate(
    () =>
      (window as unknown as { themeChanges: (string | null)[] }).themeChanges,
  );
}

/** The choice saved in the cookie - the same the theme script will read. */
async function storeTheme(
  context: BrowserContext,
  value: string,
): Promise<void> {
  // The app address comes from the config's `use.baseURL`, so the port lives in one place.
  const url = test.info().project.use.baseURL;

  if (!url) {
    throw new Error("baseURL is not set in playwright.config.ts");
  }

  await context.addCookies([{ name: "theme", value, url }]);
}

/**
 * Presses a mode button and waits until the Server Action **finishes**.
 *
 * Waiting is required: the rerender after the action's response is exactly what used
 * to switch the attribute back. We wait for the response itself, not a timer -
 * otherwise the test would either miss the bug or be slow.
 */
async function chooseTheme(page: Page, name: string): Promise<void> {
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/settings"),
  );

  await page.getByRole("radio", { name }).click();
  await saved;
  // The response arrived - it remains to let React apply the updated tree.
  await page.waitForTimeout(150);
}

test("switching to System flips the theme once and logs no error", async ({
  page,
  context,
}) => {
  const errors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.emulateMedia({ colorScheme: "dark" });
  await storeTheme(context, "light");
  await page.goto("/settings");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await watchThemeChanges(page);
  await chooseTheme(page, "System");

  // Exactly one change: dark switched on and stayed. A second value here would mean
  // someone overwrote the attribute.
  expect(await themeChanges(page)).toEqual(["dark"]);
  expect(errors).toEqual([]);

  // The choice has to survive a reload.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("switching between light and dark flips once each way", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await storeTheme(context, "light");
  await page.goto("/settings");

  await watchThemeChanges(page);
  await chooseTheme(page, "Dark");
  await chooseTheme(page, "Light");

  // A double change on every press is the button flicker visible to the eye.
  expect(await themeChanges(page)).toEqual(["dark", "light"]);
});

test("System follows the operating system while the page stays open", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await storeTheme(context, "system");
  await page.goto("/settings");

  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "light");

  // The system's evening switch to dark should not wait for a reload.
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html).toHaveAttribute("data-theme", "dark");

  await page.emulateMedia({ colorScheme: "light" });
  await expect(html).toHaveAttribute("data-theme", "light");
});

test("an explicit choice ignores the operating system", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await storeTheme(context, "dark");
  await page.goto("/settings");

  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "dark");

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html).toHaveAttribute("data-theme", "dark");

  // The most important side of this check: the system theme listener must not touch
  // the page once the user has chosen themselves.
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html).toHaveAttribute("data-theme", "dark");
});
