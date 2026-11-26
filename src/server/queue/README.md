# src/server/queue - the check queue

The queue lives in PostgreSQL, in the `check_runs` and `check_tasks` tables
([schema decisions](../db/README.md)), not in the memory of Next.js: so tasks survive
a server restart, and the code is the same locally and on Vercel
([`CLAUDE.md`](../../../CLAUDE.md#architecture)). What a claimed task actually runs and
who calls these functions in a loop is task 4.03.

Every function takes the database and the moment `now` from outside: so tests control
time, and the worker sets one moment per step.

## Files

| File                           | Role                                                         |
| ------------------------------ | ------------------------------------------------------------ |
| `claim.ts`                     | `claimTask(db, { now, maxRunning })` - claim the next task   |
| `claim.integration.test.ts`    | Order, the limit and simultaneous claims on a real database  |
| `finish.ts`                    | `finishTask(db, claimed, { now, outcome })` - the task result |
| `finish.integration.test.ts`   | Run counters and discarded late results                      |
| `finalize.ts`                  | `finalizeRuns(db, { now })` - close finished and stuck runs  |
| `finalize.integration.test.ts` | Both finishing rules and what they leave alone               |
| `parallel-checks.ts`           | `parseParallelChecks` - the `PARALLEL_SOURCE_CHECKS` ENV, the limit of simultaneous sources |
| `parallel-checks.test.ts`      | The default, the 1-10 range, invalid values                  |
| `recover.ts`                   | `recoverStaleTasks(db, { now })` - put stuck tasks back in the queue |
| `recover.integration.test.ts`  | Stuck, fresh and out-of-attempts tasks                       |
| `run-task.ts`                  | `runTask(db, client, claimed)` - check a source and record the result |
| `run-task.integration.test.ts` | Success, a site failure, a platform without a parser, an exception, a deleted source, handing off a search |
| `discover-task.ts` | `runDiscoverTask` - the Find new pages task for one company |
| `discover-task.integration.test.ts` | An added board and its first check, every status, another company's and the company's own page, a deleted company |
| `worker.ts`                    | `createQueueWorker(options)` - the worker loop with `start` and `stop` |
| `worker.integration.test.ts`   | A run from tasks to closing; nothing is claimed after `stop` |
| `start.ts`                     | `startQueueWorker()` - one loop per server process, the limit from ENV |
| `task-error.ts`                | `CheckTaskError` - what goes into `check_tasks.error`        |
| `test-fixtures.ts`             | A source, a company for search, a run and tasks for the queue's integration tests |

## Worker loop

`createQueueWorker` is a background loop, the same wherever it runs. A step of the
loop: put stuck tasks back (`recoverStaleTasks`), close runs (`finalizeRuns`), claim
tasks for the free slots. The next step comes `POLL_MS` (2 s) **after** the previous one
finishes, so steps never overlap.

- A freed slot is filled as soon as a task finishes, not on the next step. A run closes
  on the nearest step - within 2 s after its last task.
- How many tasks run in this process is capped by `maxRunning`, and how many run across
  all processes together is held by the claim in the database.
- A failed step (for example, the database being unavailable) goes to the log and does
  not stop the loop.
- The timer does not keep the process alive (`unref`): the server stops without waiting
  for the queue. A task interrupted this way is brought back by `recoverStaleTasks`.
- `stop()` waits for all the work started - steps, refills and tasks. Otherwise a claim
  in progress would start a task after the stop, and in tests it would write to the
  database after it was cleared.

## Claiming

- **Order:** `manual` first, then `background`; within each, the older first. The enum
  itself sets the priority order ([database README](../db/README.md)).
- **One task - one worker.** The next task is chosen with `select ... for update skip
  locked`: a row held by another transaction is skipped, not waited for
  ([docs/18/sql-select](https://www.postgresql.org/docs/18/sql-select.html), "The
  Locking Clause").
- **The limit of simultaneous tasks is shared by all processes**, so it is checked in
  the database, not in memory. "How many are already `running`" and the claim are one
  transaction under `pg_advisory_xact_lock`: without it several simultaneous claims see
  a free slot and together exceed the limit - the test for this failed every time
  without the lock. The lock is released at the end of the transaction
  ([docs/18/functions-admin](https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS)).
  Claims therefore go one at a time, but each takes a few milliseconds, and we have a
  handful of workers.
- A claimed task gets `running`, `locked_at = now` and `attempts + 1`. `locked_at` goes
  back to the worker as the sign that it owns the task.

## Running a task

- `runTask` checks the source with the shared `checkSource`
  ([`checks/README.md`](../checks/README.md)) and passes the outcome to `finishTask`.
- **The check moment is the claim moment** (`locked_at`): the discovery date of new
  vacancies and the source state are counted from it. `finished_at` is the clock at the
  moment of finishing.
- **A platform without a parser** - the task succeeds with zeros, and the source state
  does not change: the same way Check now silently skips such a source.
- **An exception during a check** is a bug in our code, because parsers return site
  failures as values. The task becomes `failed` at once with the reason `crashed`, and
  the exception goes to the log. Without this it would hang in `running` until
  `recoverStaleTasks` brought it back, three times over.
- If the source was deleted after the claim, nothing is checked and the result is
  `false`.

## Page search

A `discover` task (Find new pages, task 5.10) is claimed, brought back and capped by the
shared limit the same way as a check - only running it differs. `runTask` hands it to
`runDiscoverTask`:

- the search is the same as Find pages (`discoverCompany`), and `decideNewPages` decides
  what to add and which status to set ([`discovery/README.md`](../discovery/README.md));
- the added sources, the status and the first check of the added boards are written in
  one transaction. The first check is background `check` tasks without a run: it is
  neither a manual action nor a general check, so it does not reach History;
- an exception (including a refused insert, if another company took the page in the
  meantime) makes the task `crashed`, and the company gets Check failed;
- a company deleted after the claim took the task with it by cascade - the result is
  `false`.

## Result

- `finishTask` sets `succeeded` or `failed`, `finished_at`, the parser error or the number
  of skipped records (parse warning), and in the same transaction adds the result to the
  run counters: `sources_checked + 1`, for a failed one also `sources_failed + 1`, for a
  successful one the new and removed vacancies. The worker learns how many vacancies are
  new and removed from the lifecycle (task 4.03).
- **A late result is discarded** (`false`): the task is updated only while it is
  `running` with the same `locked_at` the claim handed out. A worker whose task was taken
  away as stuck and given to another overwrites nothing. The same if the source was
  deleted: the task row is gone.
- **A finished run does not change** - the History row records the result as of the
  finish. Tasks without a run (Check now, Retry) do not touch the counters.

## Stuck tasks

- A task that stays `running` longer than `STALE_AFTER_MS` (10 min) counts as stuck: the
  process crashed, the server was killed, the computer went to sleep. It goes back to the
  queue - `queued`, `locked_at = null` - and the next claim takes it.
- 10 minutes leave room for a long source (up to `VACANCIES_TO_CHECK` vacancies, which for
  PeopleForce is 50 pages, each with a timeout and retries), but are less than the 15
  minutes without movement after which a run is closed. If a real check takes longer
  anyway, nothing breaks: the task runs a second time, and `finishTask` discards the
  first worker's result.
- **`MAX_ATTEMPTS` (3) attempts.** A task stuck on the last one becomes `failed` with the
  reason `stalled` and counts as failed in the run. Otherwise a source that crashes the
  worker every time would circle in the queue forever. These are not request retries to
  the site - the HTTP client does those ([`http/README.md`](../http/README.md)), and the
  limit of two retries applies to them.

## Finishing a run

`finalizeRuns` closes a general check by one of two rules.

- **No unfinished tasks are left** (no `queued` or `running`) - the run ended at the
  moment its last task finished. If there are no tasks at all because their sources were
  deleted, at the moment `now`.
- **The run has not moved for `IDLE_RUN_MS` (15 min).** Movement is the start of the run,
  or the claim or finish of any of its tasks. Such a run was interrupted by the computer
  sleeping or the server being killed, and without this rule it would block Check all and
  auto-checks forever. The run is closed at the moment of its last movement, so that
  Duration in History shows the work, not the sleep. The counters stay "with whatever
  numbers there are", and the unfinished tasks become `failed` with the reason
  `abandoned`: that way they reach the Failed Sources Drawer and can be retried with
  Retry, and the queue does not finish them after the History row is already recorded. A
  worker still holding such a task will not record its result - the task is no longer
  `running`.
- 15 minutes are more than `STALE_AFTER_MS` (10 min): a stuck task has time to go back to
  the queue before the run decides that nothing is moving.
- **A known limit - several users.** The limit of simultaneous tasks is shared, and the
  queue goes by age, so a run waiting behind another user's 300 tasks also has "no
  movement". For the local version with one user this cannot happen; online (stage 7) the
  rule will have to be revisited.
- Tasks outside runs (Check now, Retry) are not subject to these rules.
