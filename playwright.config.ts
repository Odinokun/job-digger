import { defineConfig, devices } from "@playwright/test";

import { e2eDatabaseUrl } from "./e2e/env.ts";

// The app address in tests. 127.0.0.1, not localhost: the server listens only on
// this interface (`next start -H 127.0.0.1`), and the rule "the server is reachable
// only from this machine" holds for tests too.
//
// Port 3001, not 3000: `npm run dev` with the development database lives on 3000.
// The E2E server runs next to it with its own database, so dev need not be stopped.
const PORT = 3001;
const baseURL = `http://127.0.0.1:${PORT}`;

// A fake web server instead of real platforms: tests never go to real sites. The
// address scheme and the saved responses: src/server/http/testing/README.md.
const FAKE_WEB_PORT = 4010;

/**
 * Playwright Test is an E2E tool only and never reaches production code.
 * https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // E2E tests live apart from the Vitest tests (`src/**/*.test.ts`), so the two
  // runners do not see each other's files.
  testDir: "e2e",

  // A separate E2E database: created, migrated and cleared before the run.
  globalSetup: "./e2e/global-setup.ts",

  // Scenarios run one at a time: they all write to one E2E database, and parallel
  // copies would see each other's data (a second copy adding Bosch got "Already
  // added"). The same as `fileParallelism: false` for the integration tests.
  // https://playwright.dev/docs/test-parallel
  workers: 1,

  // On CI: fail if a test.only was left in the code, and give a flaky scenario one
  // retry.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,

  use: {
    baseURL,
    // The trace (a record of steps, DOM and requests) is kept only for the retry of
    // a failed test - otherwise the artifacts grow with every run.
    trace: "on-first-retry",
  },

  // On CI - a short list of steps plus an HTML report: the workflow uploads it as
  // an artifact when E2E fail, and it shows the trace. Locally the default `list`
  // without a report stays, otherwise every failure would open the report in the
  // browser (the default `open` is `on-failure`).
  // https://playwright.dev/docs/test-reporters
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",

  // One browser: the app is personal, cross-browser support is not a goal.
  //
  // Two projects on the same browser. `@pending` is the definition of done of the
  // current stage, red until the stage is finished (CLAUDE.md, "Tests and TDD"):
  // `chromium` skips it, `pending` runs only it. Separate projects rather than
  // `grepInvert` at the config root, because `--grep` on the command line does not
  // cancel the config's exclusion - it only narrows the choice further.
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

  // Playwright itself starts the fake web server and the app and waits until both
  // are ready.
  // https://playwright.dev/docs/test-webserver
  webServer: [
    {
      name: "FakeWeb",
      command: `node src/server/http/testing/serve-fake-web.ts ${FAKE_WEB_PORT}`,
      // Readiness by an open port, not by url: Playwright accepts only statuses up
      // to 403, and the fake server answers 404 on the root.
      port: FAKE_WEB_PORT,
      reuseExistingServer: false,
    },
    {
      name: "App",
      // Always a production build, locally and on CI. A second `next dev` next to a
      // running one does not start: in Next 16 a lockfile keeps two `next dev` from
      // working in one project, while `next build` writes to a separate folder and
      // gets along with dev (node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md,
      // "Concurrent dev and build"). Besides, a local run behaves the same as on CI.
      command: `npm run build && npm start -- -p ${PORT}`,
      // Readiness by an open port, not by url. Playwright starts the web servers
      // BEFORE `globalSetup` (playwright 1.65, runner/index.js,
      // `createGlobalSetupTasks`), and it is `globalSetup` that creates the E2E
      // database. The `/` page (Jobs) reads the database, so on a clean machine a url
      // check got a 500 while there was no database and would wait forever. `next
      // start` opens the port when ready, and the database appears before the first test.
      port: PORT,
      // These variables are added on top of process.env, and in Next process.env
      // takes precedence over .env - so the server goes to the E2E database, not the
      // development one. src/server/http/http-client.ts reads FAKE_WEB_ORIGIN: with
      // it, all of the app's outgoing requests go to the fake web server.
      // AUTO_CHECK=off: a fresh E2E database has had no general check yet, and the
      // schedule would start one in the middle of a scenario (task 6.03).
      env: {
        DATABASE_URL: e2eDatabaseUrl,
        FAKE_WEB_ORIGIN: `http://127.0.0.1:${FAKE_WEB_PORT}`,
        AUTO_CHECK: "off",
      },
      // Do not reuse someone else's server: if something already answers on the
      // port, it is unknown which database it works with. Then the run fails with an error.
      reuseExistingServer: false,
      // A cold build takes longer than a warm one - the default 60 s is not always enough.
      timeout: 120_000,
    },
  ],
});
