import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * База разом із пулом: `$client` потрібен службовим скриптам, щоб закрити
 * зʼєднання й дати процесу завершитися.
 */
export type Database = NodePgDatabase & { $client: Pool };

// Пул зʼєднань: встановлення зʼєднання з PostgreSQL коштує часу, тому кілька
// зʼєднань тримаються відкритими і перевикористовуються між запитами. Пул один
// на процес - і в dev, і в продакшні.
//
// Кеш на `globalThis`, а не в змінній модуля: у dev-режимі Next перезавантажує
// серверні модулі після кожної зміни коду, і змінна модуля обнулялася б разом
// із ним - новий пул на кожне перезавантаження, а старий лишався б із
// відкритими зʼєднаннями.
//
// До 3.23 кеш вмикався лише поза продакшном, бо «модуль виконується один раз».
// Модуль - так, але `getDb()` викликається на кожен запит, і `next start`
// створював новий пул на кожен виклик, доки PostgreSQL не відповідав «too many
// clients already».
const globalForDb = globalThis as typeof globalThis & {
  jobDiggerPool?: Pool;
  jobDiggerDb?: Database;
};

/**
 * Єдина точка доступу до бази.
 *
 * Підключення створюється при першому виклику, а не при імпорті модуля:
 * `next build` виконує модулі сторінок, щоб зібрати їхню конфігурацію, і якби
 * помилка про відсутній `DATABASE_URL` кидалася на імпорті, збірка вимагала б
 * бази навіть там, де жодного запиту не буде.
 */
export function getDb(): Database {
  if (globalForDb.jobDiggerDb) {
    return globalForDb.jobDiggerDb;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set: copy .env.example to .env and fill it in",
    );
  }

  const pool = globalForDb.jobDiggerPool ?? new Pool({ connectionString });
  const db = drizzle({ client: pool });

  globalForDb.jobDiggerPool = pool;
  globalForDb.jobDiggerDb = db;

  return db;
}
