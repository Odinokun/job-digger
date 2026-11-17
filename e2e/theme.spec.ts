import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Перемикання оформлення.
 *
 * Сценарій не просто перевіряє кінцеву тему, а **лічить зміни `data-theme`**.
 * Баг, через який він зʼявився, кінцевий стан не ламав: тема встигала
 * увімкнутися й повернутися назад, бо атрибутом володіли двоє - React, який
 * рендерив його з cookie, і клієнтський перемикач. На екрані це було блимання,
 * а в консолі - помилка про `<script>`, що зʼявився під час клієнтського
 * рендера. Перевірка «на кінцевий стан» усе це пропускала.
 */

const APP_URL = "http://127.0.0.1:3000";

/** Починає стежити за змінами `data-theme` на `<html>`. */
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

/** Вибір, збережений у cookie, - те саме, що прочитає скрипт теми. */
async function storeTheme(
  context: BrowserContext,
  value: string,
): Promise<void> {
  await context.addCookies([{ name: "theme", value, url: APP_URL }]);
}

/**
 * Натискає кнопку режиму й чекає, поки Server Action **завершиться**.
 *
 * Чекати обовʼязково: саме перерендер після відповіді дії раніше й повертав
 * атрибут назад. Чекаємо на саму відповідь, а не на таймер, - інакше тест або
 * пропускав би баг, або був би повільним.
 */
async function chooseTheme(page: Page, name: string): Promise<void> {
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/settings"),
  );

  await page.getByRole("radio", { name }).click();
  await saved;
  // Відповідь прийшла - лишилося дати React застосувати оновлене дерево.
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

  // Рівно одна зміна: увімкнулася темна - і лишилася. Друге значення тут
  // означало б, що атрибут хтось перезаписав.
  expect(await themeChanges(page)).toEqual(["dark"]);
  expect(errors).toEqual([]);

  // Вибір має пережити перезавантаження.
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

  // Подвійна зміна на кожне натискання - це те блимання кнопок, яке видно оком.
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

  // Вечірній перехід системи в темну не має чекати на перезавантаження.
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

  // Найважливіший бік цієї перевірки: слухач системної теми не має чіпати
  // сторінку, коли користувач уже вибрав сам.
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html).toHaveAttribute("data-theme", "dark");
});
