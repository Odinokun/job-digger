/**
 * Демо-компанії для ручної перевірки: `npm run db:seed:demo`.
 *
 * Окремо від `db:seed`, бо це різні сорти даних: без системного користувача
 * застосунок не працює, а демо-компанії потрібні лише для того, щоб було на чому
 * клікати (див. README, «Межа між міграцією і seed»). Через це команда лишається
 * локальною і на базу онлайн-версії не запускається.
 *
 * Запуск кілька разів безпечний: вже додані компанії скрипт не торкається.
 */
import { getDb } from "./client.ts";
import { seedDemoCompanies } from "./demo-companies.ts";
import { getSystemUser } from "./system-user.ts";

const db = getDb();
// Лише читає: якщо користувача немає, помилка підкаже запустити `npm run db:seed`.
const user = await getSystemUser(db);
const inserted = await seedDemoCompanies(db, user.id);

console.log(
  `Demo companies: added ${inserted.companies} companies and ${inserted.sources} career sources`,
);

await db.$client.end();
