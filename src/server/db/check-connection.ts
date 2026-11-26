/**
 * Checks the database connection: `npm run db:check`.
 * A helper script for development, never imported into the app.
 */
import { sql } from "drizzle-orm";

import { getDb } from "./client.ts";

const db = getDb();
const result = await db.execute<{ version: string }>(sql`select version()`);

console.log("Connected:", result.rows[0]?.version);

await db.$client.end();
