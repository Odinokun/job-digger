/**
 * Runs once for the whole integration test run: creates the test database if it
 * does not exist and runs our migrations on it. So every run also checks that
 * the migrations apply to a clean database.
 */
import { createDatabaseIfMissing, migrateDatabase } from "./database.ts";
import { testDatabaseUrl } from "./env.ts";

export default async function setup(): Promise<void> {
  await createDatabaseIfMissing(testDatabaseUrl);
  await migrateDatabase(testDatabaseUrl);
}
