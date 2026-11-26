/**
 * Preparing a separate database for tests: creating it, migrations, cleanup.
 *
 * The address is passed as a parameter rather than taken from `env.ts`, because
 * two test levels with their own databases use this code: integration
 * (`TEST_DATABASE_URL`) and E2E (`E2E_DATABASE_URL`).
 */
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

export async function createDatabaseIfMissing(url: string): Promise<void> {
  const databaseName = decodeURIComponent(new URL(url).pathname.slice(1));

  // `create database` cannot run while connected to that same database, so we
  // connect to the `postgres` maintenance database.
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
      // A database name cannot be a query parameter, so it is escaped as an identifier.
      await client.query(
        `create database "${databaseName.replaceAll('"', '""')}"`,
      );
    }
  } finally {
    await client.end();
  }
}

/** Runs the migrations from `drizzle/` on the database at the address. */
export async function migrateDatabase(url: string): Promise<void> {
  const db = drizzle(url);

  try {
    await migrate(db, { migrationsFolder: "drizzle" });
  } finally {
    await db.$client.end();
  }
}

/**
 * A clean database state.
 *
 * `truncate`, not a transaction with a rollback: the code under test works with
 * transactions itself (the queue claims tasks with `select ... for update skip
 * locked`), and an outer transaction would break that.
 *
 * `restart identity` resets sequences, and `cascade` removes the question of
 * deletion order with foreign keys.
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
