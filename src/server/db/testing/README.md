# src/server/db/testing - the test database

The harness for integration tests: a real PostgreSQL instead of database mocks.
`database.ts` is shared with E2E too: their separate database is prepared by the same
code ([README](../../../../README.md#e2e-тести)).
Test levels and TDD rules: [CLAUDE.md](../../../../CLAUDE.md#tests-and-tdd).

## Files

| File              | Role                                                                  |
| ----------------- | --------------------------------------------------------------------- |
| `env.ts`          | Reads `TEST_DATABASE_URL` and keeps it from being mixed up with the development database |
| `database.ts`     | `createDatabaseIfMissing`, `migrateDatabase`, `truncateAll` for a database at an address - shared with E2E |
| `global-setup.ts` | Once per run: creates the database if missing and runs the migrations |
| `test-db.ts`      | The `testDb` connection and `truncateAll()` of the test database itself |
| `setup.ts`        | `beforeEach(truncateAll)` and closing the pool after a test file      |
| `locks.ts` | `untilSomeoneWaitsForLock` - waits until a query queues behind a lock: a race test knows the race really happened |
| `career-source-values.ts` | `normalizedSourceUrl` - the cleaned address for inserting a source directly in tests |
| `company-values.ts` | `companySiteValues` - a unique site (`url` and `normalized_url`) for inserting a company directly in tests: both columns are required |

## How it works

1. `global-setup.ts` connects to the `postgres` maintenance database, checks
   `pg_database` and creates the test database if it does not exist yet. Then it runs
   the migrations from `drizzle/` on it. So every run also checks that the migrations
   apply to a clean database.
2. `setup.ts` clears the tables before **every** test, so tests do not depend on the
   order they run in or on data a previous test left behind.
3. After a test file the connection pool is closed - otherwise the run hangs on open
   connections.

## Decisions not worth revisiting

**A separate database in the same container, not a second service in compose.** The
same PostgreSQL version, zero extra memory, one service. Isolation is needed at the
data level, not the process level.

**`truncate`, not a transaction with a rollback.** Rolling back a transaction is faster
and more elegant, but it breaks when the code under test works with transactions
itself - and the task queue does exactly that (`select ... for update skip locked`).
For the main thing we test, that approach does not work.

**`fileParallelism: false` for integration tests.** The files share one database, so a
parallel run would overwrite data. Unit tests stay parallel.

**The guard in `env.ts`.** If `TEST_DATABASE_URL` equals `DATABASE_URL`, the module
throws. Otherwise the cost of the mistake is a wiped development database.

## Environment variables

Vitest automatically picks up from `.env` only the variables prefixed with `VITE_`
([documentation](https://vitest.dev/guide/features)). So `vitest.config.ts` loads
`.env` through `loadEnv` and also assigns the values to `process.env`: `globalSetup`
runs in Vitest's main process, not in a test worker, and the `test.env` option does
not apply to it.
