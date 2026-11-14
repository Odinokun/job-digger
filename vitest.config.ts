import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Vitest не читає `paths` із tsconfig.json - аліас задається тут окремо.
    // Плагін vite-tsconfig-paths не беремо: один рядок не варто залежності.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
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
          // Інтеграційні тести ділять одну базу: паралельні файли затирали б
          // одне одному дані.
          fileParallelism: false,
        },
      },
    ],
  },
});
