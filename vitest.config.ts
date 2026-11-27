import { fileURLToPath } from "node:url";

import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Vitest itself picks up from .env only variables with the VITE_ prefix, so the rest
// are loaded explicitly: the third argument "" means "no prefix filter". Assigning
// to process.env is needed for globalSetup - it runs in the main Vitest process, not
// in a test worker.
const env = loadEnv("test", process.cwd(), "");
Object.assign(process.env, env);

export default defineConfig({
  resolve: {
    // Vitest does not read `paths` from tsconfig.json - the alias is set here
    // separately. We skip the vite-tsconfig-paths plugin: one line is not worth a dependency.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    env,
    // Two test levels in one config. Inline projects inherit the root config's
    // settings (extends is on since Vitest 5.0).
    projects: [
      {
        test: {
          // Pure logic: no database, no network. Files are `*.test.ts`.
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.integration.test.ts"],
        },
      },
      {
        test: {
          // Real PostgreSQL on a separate test database.
          name: "integration",
          include: ["src/**/*.integration.test.ts"],
          // Create the test database and run migrations - once per run.
          globalSetup: ["src/server/db/testing/global-setup.ts"],
          // A clean state before every test - set up before every test file.
          setupFiles: ["src/server/db/testing/setup.ts"],
          // Integration tests share one database: parallel files would overwrite
          // each other's data.
          fileParallelism: false,
        },
      },
    ],
  },
});
