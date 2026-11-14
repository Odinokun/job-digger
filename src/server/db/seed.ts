/**
 * Початкові дані: `npm run db:seed`.
 *
 * Міграції створюють структуру бази, seed наповнює її даними, без яких застосунок
 * не працює. Запуск кілька разів безпечний - логіка в system-user.ts, вона ж
 * покрита інтеграційним тестом.
 */
import { db } from "./client.ts";
import { seedSystemUser } from "./system-user.ts";

const systemUser = await seedSystemUser(db);

console.log("System user:", systemUser.id, systemUser.email);

await db.$client.end();
