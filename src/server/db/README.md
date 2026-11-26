# src/server/db - the database

The schema, the connection and helper scripts. The data model is the schema itself
(`schema.ts`) plus the decisions below. How to start the local database and a cheat sheet
of Docker commands: [the root README](../../../README.md#база-даних).

## Files

| File                  | Contents                                                          |
| --------------------- | ----------------------------------------------------------------- |
| `schema.ts`           | Tables as code - the source of truth about the database structure |
| `client.ts`           | `getDb()` - the connection pool and the single point of access to the database |
| `client.test.ts`      | One pool per process, in production too                           |
| `system-user.ts`      | `seedSystemUser(db)` creates, `getSystemUser(db)` only reads      |
| `seed.ts`             | The initial data runner (`npm run db:seed`)                       |
| `demo-companies.ts`   | `seedDemoCompanies(db, userId)` - a set of companies for manual testing |
| `seed-demo.ts`        | The demo company runner (`npm run db:seed:demo`)                  |
| `time.ts`             | `dbTimeText` - the database time with microseconds for cursors and boundaries, `DB_TIME_PATTERN` |
| `check-connection.ts` | Checking the connection (`npm run db:check`)                      |
| `backup.ts`           | A `pg_dump` backup into `BACKUP_DIR` (`npm run db:backup`, `npm run app`) |
| `backup-plan.ts`      | Backup file names, "has a day passed", which old backups to delete (we keep 30) |
| [`testing/`](testing/README.md) | The integration test harness: the test database and a clean state |

The generated migrations are in `drizzle/` at the project root.

Pages take the user through `getSystemUser`, not `seedSystemUser`: viewing a page must
not write to the database. If there is no user, the error says to run `npm run db:seed`.

Functions like `seedSystemUser` take the database as an argument instead of taking `db`
from `client.ts`: that way the same logic works on both the development and the test
database.

## Schema decisions

**Derived statuses are not stored.** Tracked / Not tracked is "does the company have at
least one source with `is_tracked`", and OK / Has errors / Checking are computed from the
sources and the queue. The database keeps only `discovery_status` - the states of the Not
tracked tab (`not_checked`, `not_found`, `unsupported`, `check_failed`, `possible_page`),
which cannot be derived from anything. The fifth, `possible_page` (task 5.10): Find new
pages found a board only by name, and a person confirms it.

**The company address is stored twice.** `url` is the address as the user typed it,
including the path: `bosch.com/de` and `bosch.com/ua` are different companies.
`normalized_url` is the cleaned form of the same address, needed only for comparing
duplicates. The unique index is on the pair `(user_id, normalized_url)`, so one user adds
the same company only once, while different users can follow one company.

**The company's main site is required** - `url` and `normalized_url` are `NOT NULL` since
migration `0024` (task company-site-required). Before that both columns were nullable: an
ATS address gives no main site (`jobs.lever.co/spotify`), and it cannot be derived from
the slug (task 2.17). Before the migration, companies without a site were checked in both
databases: the working one had none, and two were deleted from the development one. A
database where they remain will not pass the migration - first fill in the site or delete
such companies.

**The source address is stored twice too.** `career_sources.normalized_url` appeared
together with companies without a site (task 2.17) and stayed: only a shared source
recognises the same company under another site (`findCompanyWithSource`). Normalization
lives in TypeScript (`normalizeCompanyUrl`) and cannot be written as an SQL expression, so
the result has to be stored.

**Duplicate sources are not forbidden.** `career_sources` deliberately has no unique index
on the address - and did not get one even when the check "this source already belongs to
another company" was needed. Uniqueness is needed within a user, and `career_sources` does
not store its owner: one index on one table cannot express this, because PostgreSQL cannot
do a unique constraint across a join. To make the index possible, `user_id` would have to
be denormalized and held by a composite foreign key to `companies(id, user_id)`, which in
turn needs a unique index on `companies(id, user_id)`. What that buys is atomicity against
the "two simultaneous Saves" race, which costs one extra row removed with the Remove
button. So the check stays friendly and lives in code
([`companies/source-duplicates.ts`](../companies/source-duplicates.ts)), and an index on
top of the existing column stays possible later - a one-line migration.

**The source label is optional.** `career_sources.label` keeps what the user tells sources
of one site apart by: three filters of `mozilla.org/en-US/careers/listings/` differ only in
`query`, and the raw URL does not tell them apart. The column is nullable, because a source
with its own domain needs no label, and an empty label is a legitimate state, not missing
data (task 2.16).

**An unsupported page is kept.** A source with `platform = unsupported` and `is_tracked =
false` stays in the database: the address will be useful if new ways of reading appear.

**Enumerated values are PostgreSQL types** (`pgEnum`), not text: the database itself will
not accept an invalid value, even if the write goes around our code. The cost: a new
platform means an `ALTER TYPE ... ADD VALUE` migration, and PostgreSQL cannot remove a
value from an enum.

**A `CHECK` on the company name.** `NOT NULL` does not catch an empty string, and an empty
name would give a blank row in the company list.

**Indexes are added by hand.** PostgreSQL does not index a foreign key automatically, so
there is an index on `career_sources.company_id`, and the company list is read by `(user_id,
name)` - the same pair it is sorted by.

**Vacancies (`vacancies`, task 3.04).**

- **The key is unique within a source** - the unique index `(source_id, key)`: "no repeated
  records within one source" is held by the database, not only the code. Across sources the
  same key is allowed - duplicates there are not merged. The key string itself
  (`id:<ID on the platform>` or `url:<cleaned address>`) is built by task 3.05.
- **There is no separate index on `source_id`:** the unique index starts with that column,
  and PostgreSQL uses it both for a source's vacancies and for cascade deletion.
- **A cascade from the source.** Deleting a source or a company takes its vacancies,
  including those in Favorites - the same rule as for Delete company.
- **`closed_at`, not a flag.** The Closed mark keeps the moment a vacancy disappeared from
  Favorites, so it is visible when it closed.
- **There is no user in the table** - it comes through the source and the company, the
  same as for `career_sources` (the decision above).
- **The Jobs list** is sorted and paginated by `(first_detected_at, id)` - there is a
  separate index for that.
- **Two appearance dates.** `first_detected_at` is the start of the check that found the
  vacancy (Jobs is sorted by it), `created_at` is the moment the row was written by the
  database clock (migration 0007). The second is the boundary of Mark all as read: a check
  in progress writes vacancies with an earlier first date but a later second one
  ([`src/server/vacancies/README.md`](../vacancies/README.md#concurrent-changes)). There is no
  index on `created_at`: the query is limited to the user's vacancies anyway.

**Check runs (`check_runs`, task 4.01).** The test is `checks.integration.test.ts`.

- **A row is only a general check** (Check all or an auto-check), that is a History row.
  Check now and Retry are not written here.
- **The counters are stored, not computed from `check_tasks`.** A History row records the
  result as of the finish: Retry does not change it, and the tasks of a deleted source go
  with it, so numbers computed from the tasks would shift after the fact. `sources_checked`
  includes failed ones - the same as Sources checked in History.
- **One active check per user is a partial unique index** `(user_id) where finished_at is
  null`. Two simultaneous Check alls cannot slip past even the check in the code: the
  second `insert` gets a uniqueness violation
  ([docs/18/indexes-partial](https://www.postgresql.org/docs/18/indexes-partial.html),
  example 11.3).
- **`summary_shown_at`, not a flag** - like `closed_at`: the summary has to pop up once,
  even if the run finished while the tab was closed (task 4.06).

**Queue tasks (`check_tasks`, task 4.01).** The test is the same
`checks.integration.test.ts`.

- **Two kinds of tasks in one queue** (`kind`, migration 0010, task 5.10): `check` - checking
  one source (`source_id`), `discover` - Find new pages for one company (`company_id`). One
  queue rather than two tables: the shared limit of simultaneous tasks, claiming and
  returning stuck tasks work the same for both. The `check_tasks_target_matches_kind`
  CHECK requires exactly the target the kind needs.
- **`run_id` points to the general check** that created the task; for Check now, Retry and
  Find new pages it is `null`, because they are not recorded in History.
- **The priority is a `manual` / `background` enum, and the order of the values is the
  claim order.** "The ordering of the values in an enum type is the order in which the
  values were listed when the type was created"
  ([docs/18/datatype-enum](https://www.postgresql.org/docs/18/datatype-enum.html)), so
  `order by priority` puts manual tasks first without a separate weights table.
- **Deleting a source takes its tasks by cascade** - that is how unfinished ones get
  cancelled. A claimed one runs to the end, and the lifecycle discards its result because
  the source is gone ([`vacancies/README.md`](../vacancies/README.md)). A deleted source
  disappears from the Failed Sources Drawer by itself, and the run counters in `check_runs`
  do not change. That is why there is no `cancelled` status: the original plan expected it
  for Find pages, cancelled by closing the modal, but Find pages does not go through the
  queue (the next point).
- **Find pages in the modal does not go through the queue**: its subject is an address,
  not a saved company, and it runs right in the Server Action (task 5.07). Only Find new
  pages goes through the queue - it searches for companies already saved.
- **`locked_at`** - when a worker claimed the task. By it a task stuck in `running` goes
  back to the queue (task 4.02).
- **`error` is `jsonb` with a `CheckTaskError`**: the parser error as the parser returned
  it ([`parsers/types.ts`](../parsers/types.ts)), or a reason from the queue itself
  ([`queue/task-error.ts`](../queue/task-error.ts)). The Failed Sources Drawer shows the
  reason, and a new reason needs no migration. History does not show these details.
- **`skipped_vacancies`** is the parse warning: how many records the parser skipped
  because of bad data ([`parsers/README.md`](../parsers/README.md), "Shared format").
- **The queue index is partial** - `(priority, created_at) where status = 'queued'`: the
  queue always holds a handful of rows, while finished tasks pile up in the thousands.

## How the database structure changes

1. Edit `schema.ts`.
2. `npm run db:generate` - Drizzle compares the schema with the snapshot of the previous
   state (`drizzle/meta/*`) and writes the SQL file itself.
3. Read the generated SQL. It goes into git and is reviewed like ordinary code.
4. `npm run db:migrate` - applies the migrations the database has not seen yet.

The database keeps a log of applied migrations in the `drizzle.__drizzle_migrations` table,
so running `db:migrate` again does nothing.

**Files in `drizzle/` are never edited by hand** - `drizzle-kit` writes them, and the
`protect-files.sh` hook blocks writes there. The snapshots in `drizzle/meta/` are needed in
git too: without them the next `generate` would not know the previous state of the schema.

**We do not use `drizzle-kit push`.** It changes the database directly, leaving no files:
nothing gets into git, there is no review, and nothing can reproduce the same structure on
Neon.

## The line between a migration and the seed

A migration changes the **structure** (tables, columns, indexes), the seed fills in the
**data** the app cannot work without. Row inserts do not go into migrations - otherwise
migrations stop being reproducible.

The seed has to be idempotent: running it twice gives the same result as running it once.
That takes `onConflictDoNothing()` rather than a plain `insert`. The
`system-user.integration.test.ts` integration test covers this.

**Demo companies are a third kind of data and a separate command.** `db:seed` creates what
the app cannot work without, and `db:seed:demo` adds companies so there is something to
click on the Companies page during manual testing. Thanks to this line, demo data cannot
accidentally reach the online version's database: only `db:seed` runs there.

The demo set's idempotency rests on a different rule than the system user's. The unique
index `(user_id, normalized_url)` guards a company, while `career_sources` deliberately has
no unique index, so sources are inserted **only together with a new company**: the script
does not touch an existing company at all, nor any source added or removed by hand.

The addresses in the set are real and verified - in stage 3 the same set was used to run
the parsers on real pages. `normalized_url` is not written into the data by hand:
`normalizeCompanyUrl` computes it, the same function as adding a company by hand.

## The connection pool and dev mode

`client.ts` keeps a connection pool: opening a connection to PostgreSQL takes time, so a
few connections stay open and are reused.

**One pool per process - in dev and in production**, cached in `globalThis`. In dev mode
Next reloads server modules after every code change, so a module variable would be reset -
a new pool on every reload, while the old one stayed with its connections open.
`globalThis` survives the reload.

Until task 3.23 the cache was on only outside production - "the module runs once". The
module does, but `getDb()` is called on every request, and `next start` created a new pool
on every call. E2E (which runs on a production build) ran into PostgreSQL's limit - "sorry,
too many clients already" - as soon as the unread counter (3.19) added a query to every
render. The test is `client.test.ts`.

**The connection is created on the first `getDb()` call, not when the module is
imported.** `next build` executes page modules to collect their configuration: while the
error about a missing `DATABASE_URL` was thrown on import, the build failed on a page that
makes no query during the build. Because of this, CI with only `TEST_DATABASE_URL` could
not build the app.

## Helper scripts

`seed.ts` and `check-connection.ts` run through `node` without a bundler - like the
project's other helper scripts ([the root README](../../../README.md#стек)). Hence the
`.ts` extension in their imports: native TypeScript in Node requires it.

`drizzle-kit` reads `.env` by itself, so we do not need the `dotenv` from the Drizzle docs
(checked empirically).

About the Drizzle version and why the API is checked against the types rather than the
site: [CLAUDE.md](../../../CLAUDE.md#stack).
