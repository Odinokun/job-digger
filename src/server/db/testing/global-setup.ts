/**
 * Виконується один раз на весь прогін інтеграційних тестів: створює тестову базу,
 * якщо її немає, і проганяє на ній наші міграції. Отже кожен прогін ще й перевіряє,
 * що міграції застосовні на чистій базі.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

import { testDatabaseUrl } from "./env.ts";

async function createDatabaseIfMissing(): Promise<void> {
  const url = new URL(testDatabaseUrl);
  const databaseName = decodeURIComponent(url.pathname.slice(1));

  // `create database` не можна виконати, будучи підключеним до тієї самої бази,
  // тому підключаємося до службової `postgres`.
  const maintenanceUrl = new URL(testDatabaseUrl);
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

export default async function setup(): Promise<void> {
  await createDatabaseIfMissing();

  const db = drizzle(testDatabaseUrl);

  try {
    await migrate(db, { migrationsFolder: "drizzle" });
  } finally {
    await db.$client.end();
  }
}
