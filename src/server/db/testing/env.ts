/**
 * Адреса тестової бази. Окрема база, а не база розробки: тести чистять таблиці
 * перед кожним тестом.
 */
const url = process.env.TEST_DATABASE_URL;

if (!url) {
  throw new Error("TEST_DATABASE_URL is not set: see .env.example");
}

// Запобіжник: якщо адреси збігаються, прогін тестів зніс би дані розробки.
if (url === process.env.DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL must point to a different database than DATABASE_URL",
  );
}

export const testDatabaseUrl = url;
