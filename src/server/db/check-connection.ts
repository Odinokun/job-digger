/**
 * Перевірка підключення до бази: `npm run db:check`.
 * Службовий скрипт для розробки, у застосунок не імпортується.
 */
import { sql } from "drizzle-orm";

import { getDb } from "./client.ts";

const db = getDb();
const result = await db.execute<{ version: string }>(sql`select version()`);

console.log("Connected:", result.rows[0]?.version);

await db.$client.end();
