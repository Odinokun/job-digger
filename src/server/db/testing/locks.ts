import { sql } from "drizzle-orm";

import { testDb } from "./test-db.ts";

/**
 * Чекає, поки якийсь запит у тестовій базі стане в чергу за блокуванням -
 * так тест знає, що гонка справді сталася, а не що перевірка просто не
 * встигла.
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
