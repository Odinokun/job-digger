import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

import { testDatabaseUrl } from "./env.ts";

/** Підключення до тестової бази. У тестах використовується замість `db`. */
export const testDb = drizzle(testDatabaseUrl);

/**
 * Чистий стан перед тестом.
 *
 * `truncate`, а не транзакція з відкатом: тестований код сам працюватиме з
 * транзакціями (черга захоплює завдання через `select ... for update skip locked`),
 * і зовнішня транзакція це зламала б.
 *
 * `restart identity` скидає послідовності, `cascade` знімає питання порядку
 * видалення при зовнішніх ключах.
 */
export async function truncateAll(): Promise<void> {
  const tables = await testDb.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );

  if (tables.rows.length === 0) {
    return;
  }

  const list = tables.rows
    .map((row) => `"public"."${row.tablename.replaceAll('"', '""')}"`)
    .join(", ");

  await testDb.execute(
    sql.raw(`truncate table ${list} restart identity cascade`),
  );
}
