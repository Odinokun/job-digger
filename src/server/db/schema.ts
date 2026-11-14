import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Єдиний користувач локальної версії. Значення технічне: пошта нікуди не йде,
 * вхід через Google зʼявиться лише в онлайн-версії з allow-list у ENV.
 */
export const SYSTEM_USER_EMAIL = "system@job-digger.local";

/**
 * Власник даних. Компанії, джерела, вакансії й налаштування звʼязані з користувачем,
 * щоб дані були ізольовані навіть у локальній однокористувацькій версії
 * (docs/data.md, розділ 9).
 */
export const users = pgTable("users", {
  // uuid, а не послідовне число: після переїзду онлайн id не має бути вгадуваним.
  id: uuid("id").primaryKey().defaultRandom(),
  // Для майбутнього входу через Google. У локальній версії - технічне значення.
  email: text("email").notNull().unique(),
  // timestamptz, а не timestamp: зберігає момент часу, а не «настінний» час без зони.
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
