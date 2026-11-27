import { existsSync } from "node:fs";

// Playwright does not read `.env` itself. Locally the variables come from it; on CI
// there is no file - there they come from the workflow.
// https://nodejs.org/api/process.html#processloadenvfilepath
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const url = process.env.E2E_DATABASE_URL;

if (!url) {
  throw new Error("E2E_DATABASE_URL is not set: see .env.example");
}

// A safeguard: the scenarios clear the database before the run, so matching
// addresses would wipe the development data or collide with the integration tests,
// which clear their database before every test.
for (const name of ["DATABASE_URL", "TEST_DATABASE_URL"]) {
  if (url === process.env[name]) {
    throw new Error(
      `E2E_DATABASE_URL must point to a different database than ${name}`,
    );
  }
}

/** The address of the separate E2E database. */
export const e2eDatabaseUrl = url;
