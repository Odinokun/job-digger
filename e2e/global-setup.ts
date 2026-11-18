/**
 * Виконується один раз перед усіма сценаріями: готує окрему базу E2E.
 *
 * Сценарії пишуть у базу - додають, змінюють і видаляють компанії. Тому вони
 * працюють не з базою розробки, а з власною, яка перед кожним прогоном
 * створюється (якщо її ще немає), мігрується й чиститься. Так результат не
 * залежить від того, що лежить у базі розробки, і не псує її.
 * https://playwright.dev/docs/test-global-setup-teardown
 */
import {
  createDatabaseIfMissing,
  migrateDatabase,
} from "../src/server/db/testing/database.ts";
import { resetDatabase } from "./database.ts";
import { e2eDatabaseUrl } from "./env.ts";

export default async function globalSetup(): Promise<void> {
  await createDatabaseIfMissing(e2eDatabaseUrl);
  await migrateDatabase(e2eDatabaseUrl);
  await resetDatabase();
}
