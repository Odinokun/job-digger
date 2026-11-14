/**
 * Початкові дані: `npm run db:seed`.
 *
 * Міграції створюють структуру бази, seed наповнює її даними, без яких застосунок
 * не працює. Запуск кілька разів безпечний: повторна вставка нічого не змінює.
 */
import { eq } from "drizzle-orm";

import { db } from "./client.ts";
import { SYSTEM_USER_EMAIL, users } from "./schema.ts";

// `on conflict do nothing` замість простого insert: email має unique-індекс,
// тому другий запуск інакше впав би з помилкою.
await db
  .insert(users)
  .values({ email: SYSTEM_USER_EMAIL })
  .onConflictDoNothing();

const [systemUser] = await db
  .select()
  .from(users)
  .where(eq(users.email, SYSTEM_USER_EMAIL));

console.log("System user:", systemUser?.id, systemUser?.email);

await db.$client.end();
