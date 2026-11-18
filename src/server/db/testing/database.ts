/**
 * Підготовка окремої бази для тестів: створення, міграції, очищення.
 *
 * Адреса передається параметром, а не береться з `env.ts`, бо тим самим кодом
 * користуються два рівні тестів зі своїми базами: інтеграційні
 * (`TEST_DATABASE_URL`) і E2E (`E2E_DATABASE_URL`).
 */
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

export async function createDatabaseIfMissing(url: string): Promise<void> {
  const databaseName = decodeURIComponent(new URL(url).pathname.slice(1));

  // `create database` не можна виконати, будучи підключеним до тієї самої бази,
  // тому підключаємося до службової `postgres`.
  const maintenanceUrl = new URL(url);
  maintenanceUrl.pathname = "/postgres";

  const client = new Client({ connectionString: maintenanceUrl.toString() });
  await client.connect();

  try {
    const existing = await client.query(
      "select 1 from pg_database where datname = $1",
      [databaseName],
    );

    if (existing.rowCount === 0) {
      // Назва бази не може бути параметром запиту, тому екранується як ідентифікатор.
      await client.query(
        `create database "${databaseName.replaceAll('"', '""')}"`,
      );
    }
  } finally {
    await client.end();
  }
}

/** Проганяє міграції з `drizzle/` на базі за адресою. */
export async function migrateDatabase(url: string): Promise<void> {
  const db = drizzle(url);

  try {
    await migrate(db, { migrationsFolder: "drizzle" });
  } finally {
    await db.$client.end();
  }
}

/**
 * Чистий стан бази.
 *
 * `truncate`, а не транзакція з відкатом: тестований код сам працюватиме з
 * транзакціями (черга захоплює завдання через `select ... for update skip locked`),
 * і зовнішня транзакція це зламала б.
 *
 * `restart identity` скидає послідовності, `cascade` знімає питання порядку
 * видалення при зовнішніх ключах.
 */
export async function truncateAll(db: NodePgDatabase): Promise<void> {
  const tables = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );

  if (tables.rows.length === 0) {
    return;
  }

  const list = tables.rows
    .map((row) => `"public"."${row.tablename.replaceAll('"', '""')}"`)
    .join(", ");

  await db.execute(sql.raw(`truncate table ${list} restart identity cascade`));
}
