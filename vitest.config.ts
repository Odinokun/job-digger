import { fileURLToPath } from "node:url";

import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Vitest сам підхоплює з .env лише змінні з префіксом VITE_, тому решту
// завантажуємо явно: третій аргумент "" означає «без фільтра за префіксом».
// Присвоєння в process.env потрібне для globalSetup - він виконується в
// головному процесі Vitest, а не у воркері тесту.
const env = loadEnv("test", process.cwd(), "");
Object.assign(process.env, env);

export default defineConfig({
  resolve: {
    // Vitest не читає `paths` із tsconfig.json - аліас задається тут окремо.
    // Плагін vite-tsconfig-paths не беремо: один рядок не варто залежності.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    env,
    // Два рівні тестів в одному конфізі. Inline-проєкти успадковують
    // налаштування кореневого конфіга (extends увімкнено з Vitest 5.0).
    projects: [
      {
        test: {
          // Чиста логіка: без бази, без сітки. Файли - `*.test.ts`.
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.integration.test.ts"],
        },
      },
      {
        test: {
          // Справжній PostgreSQL на окремій тестовій базі.
          name: "integration",
          include: ["src/**/*.integration.test.ts"],
          // Створити тестову базу й прогнати міграції - один раз на прогін.
          globalSetup: ["src/server/db/testing/global-setup.ts"],
          // Чистий стан перед кожним тестом - перед кожним файлом тестів.
          setupFiles: ["src/server/db/testing/setup.ts"],
          // Інтеграційні тести ділять одну базу: паралельні файли затирали б
          // одне одному дані.
          fileParallelism: false,
        },
      },
    ],
  },
});
