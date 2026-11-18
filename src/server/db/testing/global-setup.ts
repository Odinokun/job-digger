/**
 * Виконується один раз на весь прогін інтеграційних тестів: створює тестову базу,
 * якщо її немає, і проганяє на ній наші міграції. Отже кожен прогін ще й перевіряє,
 * що міграції застосовні на чистій базі.
 */
import { createDatabaseIfMissing, migrateDatabase } from "./database.ts";
import { testDatabaseUrl } from "./env.ts";

export default async function setup(): Promise<void> {
  await createDatabaseIfMissing(testDatabaseUrl);
  await migrateDatabase(testDatabaseUrl);
}
