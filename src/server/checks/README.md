# src/server/checks - source checks

Checking a source means reading it with a parser and applying the
[vacancy lifecycle](../vacancies/README.md#життєвий-цикл). `checkSource` does it, and
two callers use it: Check now for one company (synchronously, without the queue) and
the [queue](../queue/README.md), which runs the Check all tasks.

## Files

| File                                | Role                                                              |
| ----------------------------------- | ----------------------------------------------------------------- |
| `check-source.ts`                   | `checkSource(db, client, source, checkedAt, depth)` - checking one source and its outcome; writes `last_full_read_at` |
| `check-all.ts`                      | `startCheckAll(db, { userId, depthMode, now })` - queue Check all with the depth of each task |
| `read-depth.ts` | `taskReadDepth` - the depth of a general check task ("Read depth" below) |
| `read-depth.test.ts` | A manual Check all, an auto-check before and after a day since the full read |
| `check-all.integration.test.ts`     | Which sources go into a run; one active check                     |
| `find-new-pages.ts` | `startFindNewPages(db, { userId, now })` - queue Find new pages; `isFindingNewPages` - whether it is running |
| `find-new-pages.integration.test.ts` | Which companies are searched; one search per user, including simultaneous clicks |
| `check-status.ts`                   | `getCheckStatus(db, { userId })` - the progress of the active run, the summary not yet shown and the unread count; `markSummaryShown` |
| `check-status.integration.test.ts`  | The active run, the summary: which one is offered and what `markSummaryShown` marks |
| `failed-sources.ts`                 | `listFailedSources`, `retryFailedSources` - the Failed Sources Drawer |
| `failed-sources.integration.test.ts` | Which sources are in the drawer, what Retry does with them       |
| `auto-check-schedule.ts` | `nextAutoCheckAt`, `isAutoCheckDue` - the auto-check schedule (6.02); `isStartupCheckDue` - the check at startup (6.03); `lastGeneralCheckStartedAt` - what the count starts from |
| `auto-check.ts` | `runAutoChecks(db, { now, isStartup })` - one pass of the schedule over all users (6.03) |
| `auto-check.integration.test.ts` | The interval, choosing users, the startup rule, a check in progress, several users |
| `auto-check-scheduler.ts` | `createAutoCheckScheduler` - when to ask the schedule: right at startup and then every minute |
| `auto-check-scheduler.test.ts` | The order of passes, no overlap, after a failure and after `stop` - on a fake clock |
| `start-auto-checks.ts` | `startAutoChecks` - starts the schedule from `src/instrumentation.ts` unless `AUTO_CHECK=off` |
| `auto-check-env.ts` | `parseAutoCheckEnabled` - the `AUTO_CHECK` variable (`off` turns auto-checks off) |
| `auto-check-env.test.ts` | `on`/empty, `off`, an invalid value is an error |
| `auto-check-schedule.test.ts` | Counting from the start, missed time does not pile up, a changed interval applies at once |
| `auto-check-schedule.integration.test.ts` | The last general check - including the one in progress |
| `history.ts`                        | `listCheckRuns` - finished checks for History, 20 at a time with a cursor |
| `history.integration.test.ts`       | Five figures, order, the cursor, other users' and unfinished runs stay hidden |
| `check-company.ts`                  | `checkCompany(db, client, { userId, companyId, checkedAt })` - Check now |
| `check-company.integration.test.ts` | Integration tests on a real database and the fake web server      |

## Read depth

How many pages a check reads depends on who started it (task 6.16). This applies only
to platforms that read in pages; the rest always return the whole list.

| Check | Reads |
| --- | --- |
| Check all by hand | only the first page |
| Auto-check | in full if the source has not been read in full for a day or longer (`career_sources.last_full_read_at`); otherwise the first page |
| Check now of a company, the first check after Save | in full |
| Retry of failed ones | like the task that failed (`check_tasks.read_depth`) |
| The trial read of Find pages and Find new pages | the first page, "10+ vacancies" (`src/server/discovery`) |

An incomplete read closes nothing (`src/server/parsers`, "Ліміт вакансій і глибина"),
so vacancies that disappeared are noticed only on a full read - a day later at most. A
successful read with `full` counts as a full read, and so does a list that ended by
itself even on the first page.

## Check now

- Only **tracked** sources (`is_tracked`) are checked, and only those whose platform
  already has a parser ([`parsers/read-source.ts`](../parsers/read-source.ts)). The rest
  are skipped silently: a source nothing can read yet is not a failed check. Sources of a
  new parser start being checked without changes here.
- Sources are read **at the same time**. The shared HTTP client keeps politeness towards
  sites (two requests per host, a pause between starts), not the order here.
- After a check the source gets `last_checked_at`. A success also sets `last_success_at`
  and `consecutive_failures = 0`; a failure gives `consecutive_failures + 1`, and the
  vacancies stay (the lifecycle does not touch them).
- Another user's company - `{ ok: false, reason: "not-found" }`, nothing is checked.
- While the user's general check runs - `{ ok: false, reason: "check-running" }`: the
  company is being checked anyway, and we do not create duplicates. The button is
  disabled at that time, so this protects against a request that arrived after the check
  started.
- If the company or the source was deleted while the site was answering, the result is
  discarded without an error (the source lock in `syncSourceVacancies`).
- The check is synchronous: the Server Action waits until every source is read. For a
  few sources of one company this is enough. Moving Check now to the queue was discussed
  in task 6.13, and it was kept as it is
  ([decision](../../../tasks/6.13-check-now-via-queue.md)). Check now is not recorded in
  History.

## Check all

`startCheckAll` only queues the check; the [queue loop](../queue/README.md#цикл-обробника)
checks the sources.

- **One source = one task** with the `background` priority. The sources taken are those
  with `is_tracked` in the user's companies - which is exactly the Tracked tab. Not
  tracked companies have no such sources, so they never get into Check all.
- The run (`check_runs`) and all its tasks are created in one transaction: the loop never
  sees a run without tasks, and `sources_total` is the denominator of the progress.
- **A second check does not start while the first runs** - `already-running`. A partial
  unique index holds this, with `insert ... on conflict do nothing` instead of an
  exception: "For ON CONFLICT DO NOTHING, it is optional to specify a conflict_target;
  when omitted, conflicts with all usable constraints (and unique indexes) are handled"
  ([docs/18/sql-insert](https://www.postgresql.org/docs/18/sql-insert.html)). Two
  simultaneous clicks give one run - there is a test for that.
- **Nothing to check** - `nothing-to-check`, and no run is created: otherwise History
  would get a row without a single source.

## Auto-check

A general check on a schedule is the same `startCheckAll` as Check all (tasks 6.02-6.03).
The pieces:

- **When it is time** - `auto-check-schedule.ts`, pure functions. The count starts from
  the start of the last general check, manual or automatic, including the one in
  progress. The interval is the current one from Settings, so a change applies at once.
  Missed time (the computer was asleep) does not pile up: there is one check.
- **At app startup** the rule is different: the check runs if the last one started more
  than an hour ago (`isStartupCheckDue`), even when the interval has not passed yet.
- **A pass** - `runAutoChecks`: each user separately, and one user's failure does not
  stop the others. `startCheckAll` filters out a check in progress and a user without
  tracked sources.
- **The tick** - `createAutoCheckScheduler`: the first pass right away, then once a
  minute, and passes never overlap. A short tick rather than a timer for the whole
  interval: after the computer sleeps, an overdue check starts on the nearest tick.
- **`AUTO_CHECK=off`** turns all of this off, including the startup check
  (`.env.example`). E2E always sets it: a fresh database has had no check yet, and the
  schedule would start one in the middle of a scenario.

An open page notices an auto-check that has started within a minute: outside a check the
UI polls once every 60 s while the tab is visible, and at once when the tab is shown
again (task 6.29, [`lib/README.md`](../../lib/README.md#опитування-стану-перевірки)).

## Check summary

The summary of a finished run pops up **once**, even if the run ended while the tab was
closed. `check_runs.summary_shown_at` holds this.

- `getCheckStatus` returns in `summary` the **latest** finished run without the mark:
  after several auto-checks in the user's absence a fresh summary is what is needed, not
  a queue of old ones.
- `markSummaryShown` marks this run and **all older** unshown runs of the same user, but
  not newer ones - nobody has seen their summary yet. The boundary is the `finished_at`
  of the shown run; another user's `runId` gives an empty boundary and changes nothing.

## Failed sources

The Failed Sources Drawer shows the failed sources of the **last finished** general
check. They do not change the History row: Retry is a task outside the run.

- **Retry** is a task with `run_id = null`, created after the check task. For each failed
  source the freshest such Retry is taken: if it succeeded, the source leaves the drawer;
  if it is still queued, the source stays marked `isRetrying`; if it failed, its error is
  shown instead of the check's error.
- **A deleted source** disappears by itself: its tasks are deleted by cascade.
- **Retry only after the general check has finished** - `canRetry: false` while a new one
  runs. The list stays visible meanwhile.
- **`retryFailedSources`** queues a manual task (`manual`, outside the run) for the chosen
  sources or for all of them (Retry all failed). Only sources from the drawer's list that
  are not already waiting for their Retry are retried: the ids come from the client, so
  another user's or a successful source cannot be checked this way. Two simultaneous
  clicks can give two Retries of one source - that is an extra check, not an error, so
  there is no lock for it.
- The reason in the row is `reason` without technical details, plus the response code for
  `bad-status`. The row type is [`lib/checks/failed-sources.ts`](../../lib/checks/failed-sources.ts).

## History

`listCheckRuns` returns the user's **finished** general checks, newest first, 20 at a
time. A row has exactly five figures: the start time, the sources checked (including
failed ones), new and removed vacancies, the duration. A check closed by the finishing
rule ([`queue/README.md`](../queue/README.md#завершення-запуску)) gives an ordinary row.
The cursor is as in Jobs: the start time with microseconds ([`db/time.ts`](../db/time.ts))
and the `id` for equal times.

## Find new pages

A repeated page search for all companies of the Not tracked tab (task 5.10).
`startFindNewPages` queues one `discover` task per company - in the background, like
Check all, but without a row in `check_runs`: the search is not recorded in History, and
"in progress" means the user has unfinished `discover` tasks (`isFindingNewPages`). What
each task does: [`queue/README.md`](../queue/README.md#пошук-сторінок).

**One search per user is held by an advisory lock**, not a unique index: there is no row
to hang it on. The "is it running" check and the insert go in one transaction under
`pg_advisory_xact_lock(key, hashtext(user_id))`, so a second simultaneous click waits for
the first and sees its tasks. The test for this warms up the connection pool: without
that the first click finished while the others were still connecting, and the test
passed even without the lock.

Check all and Find new pages do not get in each other's way: different tabs, sharing only
the limit of simultaneous queue tasks.
