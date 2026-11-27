# src/lib - shared pure logic

Code that both the server and client components need. That is why the boundary of
this folder is kept by dependencies rather than by agreement: **nothing from
`drizzle-orm`, `src/server` or Node APIs**. Modules from `src/server` are never
imported into client components, and logic they have to share moves here.

| Path                   | What it holds                                                               |
| ---------------------- | --------------------------------------------------------------------------- |
| `companies/`           | company addresses and names, platforms, list types - [README](companies/README.md) |
| `uuid.ts`              | `isUuid` - the UUID form for ids coming from the client                      |
| `pagination/cursor.ts` | the keyset pagination cursor and parsing it from an untrusted value          |
| `vacancies/vacancy-list.ts` | Jobs tabs (`JOBS_TABS`, `parseJobsTab`, `belongsToJobsTab`), the `VacancyListItem` row type, `patchVacancy` for optimistic actions, `adjustTabCounts` - tab counts with actions still in progress, `countNewVacancies` for the new vacancies notice (in tab order) and `isRecentFavorite` - the Favorites groups |
| `vacancies/vacancy-list.test.ts` | unit tests for the tabs, `patchVacancy`, `adjustTabCounts`, `countNewVacancies`, `isRecentFavorite` and `placeVacancy` (a row after Undo goes back to its place in tab order) |
| `vacancies/undo.ts` | `keepRecentUndos` - at most three Undo notices, the oldest are closed (task vacancy-undo-toast) |
| `vacancies/undo.test.ts` | unit tests for `keepRecentUndos` |
| `checks/check-status.ts` | `CheckStatus` - the state of a general check and the unread count, which the UI gets by polling |
| `checks/failed-sources.ts` | `FailedSource`, `FailedSourcesList`, `FailureReason` - rows of the Failed Sources Drawer |
| `checks/status-poller.ts` | `createStatusPoller` - when to poll the server about the check state and when to give up; `isBusy` - whether a general check or Find new pages is running |
| `checks/status-poller.test.ts` | unit tests for the poller on a fake clock |
| `theme.ts`             | the appearance choice (Light / Dark / System), the cookie name and parsing its value |
| `csv/export-options.ts` | Export CSV options, `exportCsvHref` and `parseExportOptions` - the options in the `/api/companies-csv` address |
| `csv/export-options.test.ts` | unit tests for the options |
| `csv/import-result.ts` | `CSV_IMPORT_MAX_BYTES` (1,000,000 bytes) and `ImportCsvResult` - the import action's response |
| `settings/auto-check-interval.ts` | auto-check intervals (3, 6, 12, 24 h, 6 by default) and `parseAutoCheckInterval` - `null` for anything outside the list |
| `settings/auto-check-interval.test.ts` | unit tests for the intervals |

## Pagination cursor

Lists are read not by page number but by a cursor - the pair "sort field + id" of
the last row shown: the company name in Companies, the detection date in Jobs, the
start time in History. How the cursor works in a query:
[`server/companies/README.md`](../server/companies/README.md#lists-for-the-companies-page)
and [`server/vacancies/README.md`](../server/vacancies/README.md#jobs-lists).

Only the cursor form and `parseCursor` live here: the value comes from the client, so
an unusable cursor means "start from the beginning", not an error.

## Theme

`theme.ts` describes the user's **choice**, not what is on the screen right now:
`system` is not a third theme but a refusal to choose. An unknown cookie value becomes
`system`, that is "the user has not chosen".

Who sets the theme attribute on the page, when, and why not React:
[`app/README.md`](../app/README.md#theme-switching).

## Check status polling

`createStatusPoller` decides only **when** to ask the server; what to ask and what to
do with the answer is passed in by whoever creates it (the provider in
[`app/components`](../app/README.md)). That is why the logic is visible in unit tests
on a fake clock, without a browser.

Polling, not SSE: on Vercel Hobby an open connection keeps the function alive and
spends the same budget as the checks.

- One poll when the page loads (`start`): the schedule or another tab may have started
  a check.
- While a run is active (`run` is not `null`) - once every `POLL_INTERVAL_MS` (3 s).
  Outside a check - once every `IDLE_POLL_INTERVAL_MS` (60 s), to notice an auto-check
  that started after the page loaded (task 6.29): the schedule itself looks once a
  minute, so asking more often is pointless.
- Outside a check a hidden tab (`isHidden`) is not polled. When it is shown again, the
  owner calls `resume` - a poll right away, without waiting for the timer.
- `track(status)` - a state known without polling, for example from the Check all
  response: it is shown at once, and if a check is running, polling starts. One
  scheduled or running poll at a time, so the rate never doubles.
- `MAX_FAILED_POLLS` (3) failures in a row - one `onLost` call and a stop until the
  next page load. A success between failures resets the counter.
