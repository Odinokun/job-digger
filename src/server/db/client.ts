import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * База разом із пулом: `$client` потрібен службовим скриптам, щоб закрити
 * зʼєднання й дати процесу завершитися.
 */
export type Database = NodePgDatabase & { $client: Pool };

// Пул зʼєднань: встановлення зʼєднання з PostgreSQL коштує часу, тому кілька
// зʼєднань тримаються відкритими і перевикористовуються між запитами.
//
// У dev-режимі Next перезавантажує серверні модулі після кожної зміни коду. Без
// кешу нижче кожне перезавантаження створювало б новий пул, а старий лишався б
// із відкритими зʼєднаннями, доки база не впреться в їхній ліміт. У продакшні
// модуль виконується один раз, тому кеш там не потрібен.
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

  if (process.env.NODE_ENV !== "production") {
    globalForDb.jobDiggerPool = pool;
    globalForDb.jobDiggerDb = db;
  }

  return db;
}
