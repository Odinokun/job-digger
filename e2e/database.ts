import { drizzle } from "drizzle-orm/node-postgres";

import { seedSystemUser } from "../src/server/db/system-user.ts";
import { truncateAll } from "../src/server/db/testing/database.ts";
import { e2eDatabaseUrl } from "./env.ts";

/**
 * A clean E2E database: empty tables and the system user.
 *
 * `global-setup.ts` does this before the run. A scenario that counts data across all
 * companies (the unread counter, Check all) also calls it itself in `beforeAll`:
 * there is one database for all scenarios, and companies added by an earlier
 * scenario would change its numbers.
 *
 * The app runs as the system user and does not create it itself (`getSystemUser`
 * only reads), so without it the pages fail.
 */
export async function resetDatabase(): Promise<void> {
  const db = drizzle(e2eDatabaseUrl);

  try {
    await truncateAll(db);
    await seedSystemUser(db);
  } finally {
    await db.$client.end();
  }
}

/**
 * Only empty tables, without the system user - before migrations.
 *
 * The E2E database lives between runs, and a new migration may fail on old data:
 * that is how `0024` (the company site is required) failed on companies without a
 * site left over from a previous run. A migration has nothing to fear from empty
 * tables. The drizzle migration journal is in the `drizzle` schema, so this does not
 * touch it.
 */
export async function emptyTables(): Promise<void> {
  const db = drizzle(e2eDatabaseUrl);

  try {
    await truncateAll(db);
  } finally {
    await db.$client.end();
  }
}
