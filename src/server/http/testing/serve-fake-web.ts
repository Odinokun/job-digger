/**
 * Runs the fake web server as a separate process - for E2E, where Playwright
 * starts it next to the app (`webServer` in playwright.config.ts).
 *
 * Usage: `node src/server/http/testing/serve-fake-web.ts <port>`.
 * Serves the saved responses from the `responses/` folder next to this file.
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
