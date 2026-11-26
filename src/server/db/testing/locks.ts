import { sql } from "drizzle-orm";

import { testDb } from "./test-db.ts";

/**
 * Waits until some query in the test database queues behind a lock - this way
 * the test knows the race really happened, not that the check simply was not
 * fast enough.
 */
export async function untilSomeoneWaitsForLock(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const { rows } = await testDb.execute<{ waiting: number }>(sql`
      select count(*)::int as waiting from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'
    `);
    if (rows[0].waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error("No query started waiting for a lock");
}
