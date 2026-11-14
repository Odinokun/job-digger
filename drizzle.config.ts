import { defineConfig } from "drizzle-kit";

// Конфіг читає лише drizzle-kit - CLI для міграцій. Сам застосунок його не імпортує:
// підключення до бази живе в src/server/db/client.ts.
const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DATABASE_URL is not set: copy .env.example to .env and fill it in",
  );
}

export default defineConfig({
  dialect: "postgresql",
  // Одна схема і один набір міграцій для локальної бази і Neon.
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  // Міграції застосовуються лише з файлів у ./drizzle, тому зміни схеми
  // проходять рев'ю як код. `drizzle-kit push` ми не використовуємо.
  strict: true,
  verbose: true,
});
