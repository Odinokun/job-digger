import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { SYSTEM_USER_EMAIL, users } from "./schema.ts";

export type User = typeof users.$inferSelect;

/**
 * Створює системного користувача, якщо його ще немає, і повертає його рядок.
 *
 * База передається аргументом, а не беріться з client.ts: так та сама функція
 * працює і на базі розробки (`npm run db:seed`), і на тестовій базі.
 *
 * Запуск кілька разів безпечний: `on conflict do nothing` замість простого
 * insert, бо email має unique-індекс.
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
