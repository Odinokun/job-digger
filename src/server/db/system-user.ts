import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { SYSTEM_USER_EMAIL, users } from "./schema.ts";

export type User = typeof users.$inferSelect;

/**
 * Creates the system user if it does not exist yet and returns its row.
 *
 * The database is passed as an argument rather than taken from client.ts: this
 * way the same function works on the development database (`npm run db:seed`)
 * and on the test database.
 *
 * Running it several times is safe: `on conflict do nothing` instead of a plain
 * insert, because email has a unique index.
 */
export async function seedSystemUser(db: NodePgDatabase): Promise<User> {
  await db
    .insert(users)
    .values({ email: SYSTEM_USER_EMAIL })
    .onConflictDoNothing();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, SYSTEM_USER_EMAIL));

  if (!user) {
    throw new Error("System user is missing right after seeding");
  }

  return user;
}

/**
 * The user the local version runs as.
 *
 * Read-only: pages call this on every view, and a database write on a GET is
 * not what a view is expected to do. Filling the database is `npm run db:seed`.
 */
export async function getSystemUser(db: NodePgDatabase): Promise<User> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, SYSTEM_USER_EMAIL));

  if (!user) {
    throw new Error("System user is missing: run npm run db:seed");
  }

  return user;
}
