import { drizzle } from "drizzle-orm/node-postgres";

import { truncateAll as truncateDatabase } from "./database.ts";
import { testDatabaseUrl } from "./env.ts";

/** The test database connection. Used in tests instead of `db`. */
export const testDb = drizzle(testDatabaseUrl);

/** A clean test database state before a test. Why `truncate`: see `database.ts`. */
export async function truncateAll(): Promise<void> {
  await truncateDatabase(testDb);
}
