/**
 * Виконується перед кожним файлом інтеграційних тестів: чистий стан перед кожним
 * тестом і закриття пулу зʼєднань після файлу, щоб прогін не завис на відкритих
 * зʼєднаннях.
 */
import { afterAll, beforeEach } from "vitest";

import { testDb, truncateAll } from "./test-db.ts";

beforeEach(truncateAll);

afterAll(async () => {
  await testDb.$client.end();
});
