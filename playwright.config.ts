import { defineConfig, devices } from "@playwright/test";

// Адреса застосунку в тестах. 127.0.0.1, а не localhost: сервер слухає лише
// цей інтерфейс (`next dev -H 127.0.0.1`), і правило «сервер лише з цього
// комп'ютера» діє й для тестів.
const baseURL = "http://127.0.0.1:3000";

/**
 * Playwright Test - лише інструмент E2E, у продакшн-код не потрапляє.
 * https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // E2E живуть окремо від тестів Vitest (`src/**/*.test.ts`), щоб два раннери
  // не бачили чужих файлів.
  testDir: "e2e",

  // На CI: падати, якщо в коді лишився test.only, і давати одну спробу
  // повтору на нестабільний сценарій.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,

  use: {
    baseURL,
    // Трейс (запис кроків, DOM і запитів) зберігається лише для повтору
    // впалого тесту - інакше артефакти ростуть на кожному прогоні.
    trace: "on-first-retry",
  },

  // Один браузер: застосунок персональний, кросбраузерність не мета.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // Playwright сам підіймає застосунок і чекає, поки url відповість.
  // https://playwright.dev/docs/test-webserver
  webServer: {
    command: "npm run dev",
    url: baseURL,
    // Локально перевикористовуємо вже запущений `npm run dev`; на CI сервера
    // немає, тому Playwright завжди стартує свій.
    reuseExistingServer: !process.env.CI,
    // Перша збірка dev-сервера довга - типових 60 с не завжди досить.
    timeout: 120_000,
  },
});
