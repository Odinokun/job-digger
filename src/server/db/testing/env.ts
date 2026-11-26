/**
 * The test database address. A separate database, not the development one: the
 * tests clear the tables before every test.
 */
const url = process.env.TEST_DATABASE_URL;

if (!url) {
  throw new Error("TEST_DATABASE_URL is not set: see .env.example");
}

// A safeguard: if the addresses match, a test run would wipe the development data.
if (url === process.env.DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL must point to a different database than DATABASE_URL",
  );
}

export const testDatabaseUrl = url;
