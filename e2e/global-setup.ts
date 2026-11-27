/**
 * Runs once before all scenarios: prepares the separate E2E database.
 *
 * The scenarios write to the database - they add, change and delete companies. So
 * they work not with the development database but with their own, which before every
 * run is created (if it does not exist yet), cleared, migrated and cleared again
 * together with the system user. The first clearing is so that a new migration does
 * not trip over the data of the previous run (`emptyTables`). This way the result
 * does not depend on what is in the development database and does not spoil it.
 * https://playwright.dev/docs/test-global-setup-teardown
 */
import {
  createDatabaseIfMissing,
  migrateDatabase,
} from "../src/server/db/testing/database.ts";
import { emptyTables, resetDatabase } from "./database.ts";
import { e2eDatabaseUrl } from "./env.ts";

export default async function globalSetup(): Promise<void> {
  await createDatabaseIfMissing(e2eDatabaseUrl);
  await emptyTables();
  await migrateDatabase(e2eDatabaseUrl);
  await resetDatabase();
}
