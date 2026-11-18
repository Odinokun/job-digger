import { defineConfig, devices } from "@playwright/test";

import { e2eDatabaseUrl } from "./e2e/env.ts";

// Адреса застосунку в тестах. 127.0.0.1, а не localhost: сервер слухає лише
// цей інтерфейс (`next start -H 127.0.0.1`), і правило «сервер лише з цього
// комп'ютера» діє й для тестів.
//
// Порт 3001, а не 3000: на 3000 живе `npm run dev` із базою розробки. Сервер
// E2E працює поруч із ним і зі своєю базою, тож dev зупиняти не треба.
const PORT = 3001;
const baseURL = `http://127.0.0.1:${PORT}`;

// Фейковий вебсервер замість справжніх платформ: тести ніколи не ходять на
// справжні сайти. Схема адрес і збережені відповіді -
// src/server/http/testing/README.md.
const FAKE_WEB_PORT = 4010;

/**
 * Playwright Test - лише інструмент E2E, у продакшн-код не потрапляє.
 * https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // E2E живуть окремо від тестів Vitest (`src/**/*.test.ts`), щоб два раннери
  // не бачили чужих файлів.
  testDir: "e2e",

  // Окрема база E2E: створюється, мігрується й чиститься перед прогоном.
  globalSetup: "./e2e/global-setup.ts",

  // Сценарії по черзі: усі пишуть в одну базу E2E, і паралельні копії бачили
  // б дані одна одної (друга копія додавання Bosch отримувала «Already added»).
  // Так само, як `fileParallelism: false` в інтеграційних тестів.
  // https://playwright.dev/docs/test-parallel
  workers: 1,

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

  // На CI - короткий список кроків плюс HTML-звіт: workflow вигружає його
  // артефактом, коли E2E впали, і в ньому видно трейс. Локально лишається
  // типовий `list` без звіту, інакше кожне падіння відкривало б звіт у браузері
  // (типове значення `open` - `on-failure`).
  // https://playwright.dev/docs/test-reporters
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",

  // Один браузер: застосунок персональний, кросбраузерність не мета.
  //
  // Два проєкти на тому самому браузері. `@pending` - критерій готовності
  // поточного етапу, червоний, поки етап не зроблено (CLAUDE.md, «Тести і
  // TDD»): `chromium` його пропускає, `pending` запускає лише його. Окремі
  // проєкти, а не `grepInvert` у корені конфігу, бо `--grep` у консолі
  // виключення з конфігу не скасовує - лише звужує вибір ще більше.
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      grepInvert: /@pending/,
    },
    {
      name: "pending",
      use: { ...devices["Desktop Chrome"] },
      grep: /@pending/,
    },
  ],

  // Playwright сам підіймає фейковий вебсервер і застосунок і чекає, поки
  // обидва будуть готові.
  // https://playwright.dev/docs/test-webserver
  webServer: [
    {
      name: "FakeWeb",
      command: `node src/server/http/testing/serve-fake-web.ts ${FAKE_WEB_PORT}`,
      // Готовність - за відкритим портом, а не за url: Playwright приймає лише
      // статуси до 403, а на корінь фейковий сервер відповідає 404.
      port: FAKE_WEB_PORT,
      reuseExistingServer: false,
    },
    {
      name: "App",
      // Завжди продакшн-збірка, і локально, і на CI. Другий `next dev` поруч із
      // запущеним не стартує: у Next 16 lockfile не дає двом `next dev` працювати
      // в одному проєкті, а `next build` пише в окрему теку і з dev уживається
      // (node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md,
      // «Concurrent dev and build»). Заодно локальний прогін поводиться так само,
      // як на CI.
      command: `npm run build && npm start -- -p ${PORT}`,
      url: baseURL,
      // Змінні тут додаються поверх process.env, а process.env у Next має
      // перевагу над .env - тож сервер піде в базу E2E, а не в базу розробки.
      // FAKE_WEB_ORIGIN читає HTTP-модуль (задача 3.02): з ним усі зовнішні запити
      // застосунку йдуть на фейковий вебсервер.
      env: {
        DATABASE_URL: e2eDatabaseUrl,
        FAKE_WEB_ORIGIN: `http://127.0.0.1:${FAKE_WEB_PORT}`,
      },
      // Не перевикористовувати чужий сервер: якщо на порту вже щось відповідає,
      // невідомо, з якою базою воно працює. Тоді прогін падає з помилкою.
      reuseExistingServer: false,
      // Холодна збірка довша за теплу - типових 60 с не завжди досить.
      timeout: 120_000,
    },
  ],
});
