/**
 * Initial data: `npm run db:seed`.
 *
 * Migrations create the database structure, the seed fills in the data the app
 * cannot work without. Running it several times is safe - the logic is in
 * system-user.ts, which an integration test covers.
 */
import { getDb } from "./client.ts";
import { seedSystemUser } from "./system-user.ts";

const db = getDb();
const systemUser = await seedSystemUser(db);

console.log("System user:", systemUser.id, systemUser.email);

await db.$client.end();
