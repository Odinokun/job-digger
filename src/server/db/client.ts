import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set: copy .env.example to .env and fill it in",
  );
}

// Пул зʼєднань: встановлення зʼєднання з PostgreSQL коштує часу, тому кілька
// зʼєднань тримаються відкритими і перевикористовуються між запитами.
//
// У dev-режимі Next перезавантажує серверні модулі після кожної зміни коду.
// Без кешу нижче кожне перезавантаження створювало б новий пул, а старий
// лишався б із відкритими зʼєднаннями, доки база не впреться в їхній ліміт.
// У продакшні модуль виконується один раз, тому кеш там не потрібен.
const globalForDb = globalThis as typeof globalThis & {
  jobDiggerPool?: Pool;
};

const pool = globalForDb.jobDiggerPool ?? new Pool({ connectionString });

if (process.env.NODE_ENV !== "production") {
  globalForDb.jobDiggerPool = pool;
}

/** Єдина точка доступу до бази. Схема таблиць підключається окремою задачею. */
export const db = drizzle({ client: pool });
