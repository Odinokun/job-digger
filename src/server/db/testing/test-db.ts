import { drizzle } from "drizzle-orm/node-postgres";

import { truncateAll as truncateDatabase } from "./database.ts";
import { testDatabaseUrl } from "./env.ts";

/** Підключення до тестової бази. У тестах використовується замість `db`. */
export const testDb = drizzle(testDatabaseUrl);

/** Чистий стан тестової бази перед тестом. Чому `truncate` - `database.ts`. */
export async function truncateAll(): Promise<void> {
  await truncateDatabase(testDb);
}
