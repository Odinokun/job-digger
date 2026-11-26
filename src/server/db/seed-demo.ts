/**
 * Demo companies for manual testing: `npm run db:seed:demo`.
 *
 * Separate from `db:seed`, because these are different kinds of data: the app
 * does not work without the system user, while demo companies are only there to
 * have something to click (see the README, "The line between a migration and the
 * seed"). That is why the command stays local and is never run against the
 * online database.
 *
 * Running it several times is safe: the script does not touch companies already added.
 */
import { getDb } from "./client.ts";
import { seedDemoCompanies } from "./demo-companies.ts";
import { getSystemUser } from "./system-user.ts";

const db = getDb();
// Read-only: if there is no user, the error says to run `npm run db:seed`.
const user = await getSystemUser(db);
const inserted = await seedDemoCompanies(db, user.id);

console.log(
  `Demo companies: added ${inserted.companies} companies and ${inserted.sources} career sources`,
);

await db.$client.end();
