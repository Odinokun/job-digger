import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * The database together with its pool: helper scripts need `$client` to close
 * the connections and let the process exit.
 */
export type Database = NodePgDatabase & { $client: Pool };

// The connection pool: opening a PostgreSQL connection takes time, so a few
// connections stay open and are reused between requests. One pool per process,
// in dev and in production alike.
//
// The cache is on `globalThis`, not in a module variable: in dev mode Next
// reloads server modules after every code change, and a module variable would
// be reset with it - a new pool on every reload, while the old one stayed with
// its connections open.
//
// Before 3.23 the cache was enabled only outside production, because "the module
// runs once". The module does, but `getDb()` is called on every request, and
// `next start` created a new pool on every call until PostgreSQL answered "too
// many clients already".
const globalForDb = globalThis as typeof globalThis & {
  jobDiggerPool?: Pool;
  jobDiggerDb?: Database;
};

/**
 * The single entry point to the database.
 *
 * The connection is created on the first call, not when the module is imported:
 * `next build` executes page modules to collect their config, and if the error
 * about a missing `DATABASE_URL` were thrown on import, the build would need a
 * database even where no query ever runs.
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
