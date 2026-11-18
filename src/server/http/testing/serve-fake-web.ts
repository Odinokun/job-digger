/**
 * Запуск фейкового вебсервера окремим процесом - для E2E, де його піднімає
 * Playwright поруч із застосунком (`webServer` у playwright.config.ts).
 *
 * Використання: `node src/server/http/testing/serve-fake-web.ts <port>`.
 * Віддає збережені відповіді з теки `responses/` поруч із цим файлом.
 */
import { fileURLToPath } from "node:url";

import { startFakeWeb } from "./fake-web.ts";

const port = Number(process.argv[2]);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error("Usage: node serve-fake-web.ts <port>");
}

const root = fileURLToPath(new URL("./responses", import.meta.url));
const fakeWeb = await startFakeWeb({ root, port });

console.log(`Fake web server on ${fakeWeb.origin}, serving ${root}`);
