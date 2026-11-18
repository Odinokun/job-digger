import { existsSync } from "node:fs";

// Playwright сам `.env` не читає. Локально змінні беруться з нього, на CI файлу
// немає - там вони приходять із workflow.
// https://nodejs.org/api/process.html#processloadenvfilepath
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const url = process.env.E2E_DATABASE_URL;

if (!url) {
  throw new Error("E2E_DATABASE_URL is not set: see .env.example");
}

// Запобіжник: сценарії чистять базу перед прогоном, тож збіг адрес зніс би дані
// розробки або перетнувся б з інтеграційними тестами, які чистять свою базу
// перед кожним тестом.
for (const name of ["DATABASE_URL", "TEST_DATABASE_URL"]) {
  if (url === process.env[name]) {
    throw new Error(
      `E2E_DATABASE_URL must point to a different database than ${name}`,
    );
  }
}

/** Адреса окремої бази E2E. */
export const e2eDatabaseUrl = url;
