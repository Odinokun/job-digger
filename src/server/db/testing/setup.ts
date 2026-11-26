/**
 * Runs before every integration test file: a clean state before every test and
 * closing the connection pool after the file, so the run does not hang on open
 * connections.
 */
import { afterAll, beforeEach } from "vitest";

import { testDb, truncateAll } from "./test-db.ts";

beforeEach(truncateAll);

afterAll(async () => {
  await testDb.$client.end();
});
