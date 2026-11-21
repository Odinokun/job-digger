import { drizzle } from "drizzle-orm/node-postgres";

import { seedSystemUser } from "../src/server/db/system-user.ts";
import { truncateAll } from "../src/server/db/testing/database.ts";
import { e2eDatabaseUrl } from "./env.ts";

/**
 * Чиста база E2E: порожні таблиці й системний користувач.
 *
 * Перед прогоном це робить `global-setup.ts`. Сценарій, який рахує дані по
 * всіх компаніях (лічильник непрочитаних, Check all), викликає це ще й сам у
 * `beforeAll`: база одна на всі сценарії, і компанії, додані сценарієм, що
 * йшов раніше, змінили б його числа.
 *
 * Застосунок працює від імені системного користувача і сам його не створює
 * (`getSystemUser` лише читає), тому без нього сторінки впадуть.
 */
export async function resetDatabase(): Promise<void> {
  const db = drizzle(e2eDatabaseUrl);

  try {
    await truncateAll(db);
    await seedSystemUser(db);
  } finally {
    await db.$client.end();
  }
}

/**
 * Лише порожні таблиці, без системного користувача - перед міграціями.
 *
 * База E2E живе між прогонами, і нова міграція може не пройти на старих
 * даних: так `0024` (сайт компанії обовʼязковий) впала на компаніях без сайту,
 * що лишились від минулого прогону. Порожнім таблицям міграція не страшна.
 * Журнал міграцій drizzle лежить у схемі `drizzle`, тож його це не чіпає.
 */
export async function emptyTables(): Promise<void> {
  const db = drizzle(e2eDatabaseUrl);

  try {
    await truncateAll(db);
  } finally {
    await db.$client.end();
  }
}
