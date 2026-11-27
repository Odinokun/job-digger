# src/server/vacancies - vacancies

What the server does with vacancies after a parser has read them: the key and the
lifecycle, the user's marks and actions, the Jobs lists.

Of a vacancy we keep only the title, the address, the location and the dates. Not the
description, the salary or the employment type: the list does not show them, and the
original opens through the link. The company and the source address come through the
"vacancy → source → company" relation and are not stored separately.

## Files

| File          | Role                                             |
| ------------- | ------------------------------------------------ |
| `key.ts`      | `vacancyKey({ externalId, url })` - the vacancy key; `cleanVacancyUrl(url)` - the address in a form fit for comparison |
| `key.test.ts` | Unit tests of the key and the address cleanup    |
| `lifecycle.ts` | `syncSourceVacancies(db, { sourceId, result, checkedAt })` - what one check of a source does to its vacancies |
| `lifecycle.integration.test.ts` | Integration tests of the lifecycle on a real database |
| `duplicates.ts` | `resolveDuplicates` - which of the duplicates across the company's sources becomes read; `sourceKind` - a platform or a site |
| `duplicates.test.ts` | Unit tests of choosing the duplicate |
| `duplicates.integration.test.ts` | Duplicates on a real database: case and spaces, the platform's priority, another company, closed ones, parallel sources |
| `list.ts` | `listVacancies` - a batch of a Jobs tab; `countVacanciesByTab` - the tab counts; `hasAnyVacancy` - whether the user has any vacancies at all |
| `list.integration.test.ts` | Integration tests of the Jobs lists |
| `marks.ts` | `findVacancy`, `setVacancyRead`, `setVacancyFavorite`, `countUnread`, `markAllRead`, `setCompanyVacanciesRead` - the user's marks |
| `marks.integration.test.ts` | Integration tests of the marks |

## Cleaned address

`cleanVacancyUrl` gives a form in which two addresses of one vacancy match:

- **no tracking parameters** - `utm_*` and `gh_src`, `gh_jid` (duplicates the ID from the
  Greenhouse path, found in 3.06), `fbclid` and `gclid` (Facebook and Google ad tags).
  Other parameters stay: `?id=42` tells vacancies apart;
- **no anchor** (`#apply`) and **no trailing slash in the path**;
- **the host in lower case**, while the case of the path stays as it was: on many sites
  it matters;
- **parameters in one order** - `?b=2&a=1` and `?a=1&b=2` are the same.

## Key

`vacancyKey` is `id:<ID on the platform>`, and without an ID (`null` or an empty string)
`url:<cleaned address>`. The key is unique within a source - the `(source_id, key)`
index in the database holds that ([`db`](../db/README.md)).

- **With an ID the address does not affect the key.** It may change while the vacancy
  stays the same - the lifecycle (3.13) then only updates the address.
- **Without an ID a changed address is a new vacancy:** a different key, so the old record
  disappears and the new one appears as Unread (see [Lifecycle](#lifecycle)).
- The function takes only `{ externalId, url }`, not the parser type: a schema.org parser
  (3.11) may have no ID.

## Lifecycle

`syncSourceVacancies(db, { sourceId, result, checkedAt })` applies one parser response to
the vacancies of one source. `checkedAt` comes from whoever starts the check (the queue,
3.14), not from a clock inside the function.

| Event                                         | Action                                                                 |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| The vacancy appeared for the first time       | Create it as Unread, discovery date = `checkedAt`                      |
| Found again                                   | Update `last_seen_at`, leave Read and Favorite alone                   |
| The title, location or address changed (with an ID) | Update them, leave Read and Favorite alone                       |
| The address changed, no ID                    | A different key: the old record disappears, the new one is created as Unread |
| Gone after a successful check                 | Delete it; one in Favorites stays with `closed_at = checkedAt`         |
| A successful check without a single vacancy   | The same for every vacancy of the source                               |
| An incomplete list (`truncated`: the limit or the first page) | Only create and update; mark nothing as gone (task 6.16) |
| A deleted vacancy came back                   | Created again as a new Unread                                          |
| A Closed vacancy in Favorites came back       | Remove Closed; Read, Favorite and the discovery date stay              |
| A Closed vacancy was removed from Favorites   | Delete it like an ordinary gone one, but do not count it "removed" a second time |
| A check with an error (`ok: false`)           | Change nothing                                                         |
| The same key twice in one response            | The first one is taken                                                 |
| A new vacancy with the same title as an active one in another source of the company | Create it as read and do not count it as new - see [Duplicates across sources](#duplicates-across-sources) |
| The source was deleted while the site was answering | Write nothing; a deletion that started in parallel waits for the transaction (`FOR KEY SHARE`) and takes the new vacancies too |

The rule "appeared for the first time - Unread" also applies to the first check of a new
company: all its current vacancies land in Unread.

### How it works

Everything in one transaction. First the company row is locked (see "Duplicates across
sources"), then three steps:

1. **Upsert of the found ones:** `INSERT ... ON CONFLICT (source_id, key) DO UPDATE`. It
   updates only the check's fields - `title`, `url`, `location`, `last_seen_at`,
   `closed_at`. Read and Favorite are the user's fields, and the upsert never writes
   them. Duplicate keys are removed beforehand: PostgreSQL does not let one command
   change a row twice (cardinality violation,
   [documentation](https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT)).
2. **The gone ones** - the source's rows with `last_seen_at < checkedAt`, that is those
   the upsert did not touch. One command with a CTE: `delete` for ordinary ones,
   `update closed_at` for Favorites. No list of keys is passed - the date is enough.
3. **Duplicates across sources** - freshly created vacancies whose title is among the
   active vacancies of the company's other sources become read. This is the only place
   where a check writes Read, and only into freshly discovered vacancies (or into a site
   one that gave way to a platform) - a check never touches a vacancy the user has
   already seen.

The function returns `{ newVacancies, removedVacancies }` - the History row numbers the
queue adds to the run (`queue/finish.ts`). A new one is a row whose `first_detected_at`
equals `checkedAt` after the upsert and which did not become a read duplicate: updating
an existing vacancy does not touch the discovery date, and a vacancy that came back after
deletion is created again and is new too. Removed ones are all that disappeared from the
site: both the erased ones and the Favorites that have just got Closed. A Favorite closed
earlier is not counted a second time - the `closed_at is null` condition; likewise a
closed vacancy removed from Favorites - its deletion is not counted (`returning closed_at
is null`). A failed check or a deleted source gives zeros.

### Duplicates across sources

Task 6.20. A company sometimes has several sources with the same vacancies - an ATS, an
aggregator and its own site. Without a rule every vacancy would land in Unread once per
source.

- **A duplicate** is a new vacancy whose title matches the title of an active (not Closed)
  vacancy of **another** source of **the same** company. The comparison is lower-case,
  with spaces trimmed at the edges and collapsed inside (`comparableTitle` in
  `lifecycle.ts`). There is no fuzzy matching: "PHP developer (Payment team)" and "PHP
  Developer" are different vacancies. Two vacancies of one source with one title
  (different cities) are not duplicates.
- **A duplicate is not dropped but recorded as read:** it is not in Unread, the counter
  next to Jobs or "N new vacancies", but it is in Read and All, and History does not
  count it as new. There is deliberately no title filter - the author wants to see every
  vacancy.
- **Which one becomes read** - `resolveDuplicates`: the later one. The exception is **a
  platform beats a site** (ATSs and aggregators are "more flexible and more alive"): a
  new vacancy from a platform whose duplicates are only on sites and at least one unread
  stays unread, and the unread site ones become read. A site is a platform from
  `SITE_PLATFORMS` in `duplicates.ts` (schema.org, and later the recipe page, 6.21).
- **Parallel sources.** Sources of one company are checked at the same time, and without
  ordering both would write their copy as unread. The transaction locks the company row
  `FOR NO KEY UPDATE`: it conflicts with itself, so the vacancy writes of a company go one
  after another, but not with `FOR KEY SHARE`, which inserting a source uses to check the
  foreign key
  ([documentation](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS)).
  Renaming the company waits for the write - that is milliseconds.
- The rule does not rewrite vacancies already recorded: it applies from the first check
  after 6.20.

### Concurrent changes

The user may set Favorite exactly when a check is deleting the vacancy. The
`not is_favorite` condition is checked at the moment of deletion, not read beforehand:
PostgreSQL waits for the user's transaction and checks the condition again on the updated
row ([Read Committed](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED)),
so the vacancy stays. It does not get the Closed mark in this check - both parts of the
CTE see one database snapshot
([documentation](https://www.postgresql.org/docs/current/queries-with.html#QUERIES-WITH-MODIFYING))
- the next check sets it.

The test for this reproduces the race on two connections and waits until
`pg_stat_activity` shows the query waiting on the lock. It catches the "read the ids, then
delete by id" variant: the vacancy gets lost.

If the `checkedAt` of a new check is somehow earlier than the previous one (clocks out of
sync), the previous check's rows have `last_seen_at > checkedAt` and are simply not
deleted - an error on the safe side. Two checks of one source never run at the same time:
one source is one queue task ([`CLAUDE.md`](../../../CLAUDE.md#architecture)).

**Remove from Favorites for a closed vacancy** (`setVacancyFavorite`) is only `update
is_favorite`, without deleting (since task vacancy-undo-toast). So there is no race with
a check: the check itself deletes the row, with the same `delete ... where not
is_favorite` as the other gone ones, and a vacancy that came back to the site simply loses
Closed and becomes an ordinary active one.

**Mark all as read** (`countUnread` + `markAllRead`) has a boundary by `created_at` - the
moment the row was written by the database clock, not by the discovery date.
`first_detected_at` is `checkedAt`, the moment the check **started**, so a check running
while the dialog is open would insert new vacancies "backdated", and a boundary by
discovery date would silently make them read. `countUnread` returns the count and the
database's `now()` with microseconds (`dbTimeText`); `markAllRead` marks, in one `UPDATE`,
the unread ones with `created_at` up to that boundary. Ones written later stay Unread.

The remaining race is milliseconds: a row inserted in a transaction that started before
the boundary and ended after it has a `created_at` earlier than the boundary but was not
counted - and will be marked. The window is one short transaction writing a source, not
the whole check. Acceptable (task 3.17). The rejected option was a snapshot of IDs through
the browser: exact, but its size grew with the number of unread vacancies (tens of
thousands of IDs in batches under the 1 MB Server Action limit), and the action was not
atomic.

**Mark all as unread** (`countRead` + `markAllUnread`, task 6.18) has no boundary: only
what the user read themselves gets into the Read tab, and a check adds nothing there. A
vacancy read in another browser tab while the dialog is open also goes back to Unread -
which is exactly what the user wanted.

## Jobs lists

`listVacancies(db, { userId, tab, limit, after })` returns a batch of one tab, newest date
first, by `id` for equal dates. The date is the discovery date, and in Favorites the date
added to favorites, `coalesce(favorited_at, first_detected_at)` (`sortKey`, task
favorites-added-today): fresh favorites go on top even if the vacancy itself was found
long ago. Favorites added before the `favorited_at` column appeared (migration 0025) have
no date added and stand by their discovery date - without a false "freshness". Writing the
discovery date there in a migration is not possible: migrations in `drizzle/` are
generated only, and `coalesce` gives the same order. The user is found through the
company: a vacancy has no `user_id` of its own.

| Tab         | Condition                                |
| ----------- | ---------------------------------------- |
| `unread`    | `closed_at is null` and not read         |
| `read`      | `closed_at is null` and read             |
| `favorites` | `is_favorite`, including Closed          |
| `all`       | `closed_at is null`                      |

**The cursor** is the same as in the company list
([`lib/pagination`](../../lib/README.md#pagination-cursor)), but the key is the tab's sort
date **as text from the database**, ISO with microseconds (`to_char`). PostgreSQL stores
time to the microsecond, and a JS `Date` only to the millisecond: a cursor built from a
`Date` would lose rows at the batch boundary. A key of another shape is an unusable
cursor, and the list starts from the beginning.

`hasAnyVacancy(db, userId)` decides which text to show on an empty tab: "no vacancies yet"
or the tab's own text.

`countVacanciesByTab(db, userId)` gives the numbers in the tab names, all four in one query
(`count(*) filter (where ...)`) with the same conditions as in the table above: the number
always equals the length of the tab's list, and Unread + Read = All.

## User marks

`marks.ts` changes only the user's fields - `is_read`, `is_favorite` and `favorited_at`;
only a check writes the title, the address and the other dates. `favorited_at` is the
moment of the first star (`coalesce(favorited_at, now())`): favoriting again does not move
the vacancy to the top, and Remove from Favorites clears the date. Only a favorite has the
date - a `check` in the database holds that. The vacancy is looked up through the user's
company, so an id from the client cannot change someone else's. A malformed id (not a
UUID) gives `null`, not a database error.

- `setVacancyRead` and `setVacancyFavorite` return the updated Jobs list row (`findVacancy`,
  the same fields as in `listVacancies` - `VACANCY_ROW`), or `null` if the vacancy is gone:
  an action on a gone vacancy does nothing, without an error.
- Remove from Favorites for a closed vacancy does **not delete** it (task
  vacancy-undo-toast): it leaves every tab, and the next check of the source deletes it -
  like any vacancy gone from the site outside Favorites. Until then Undo can bring it back.
  Undo also passes the old date added (`favoritedAt`, including the `null` of an old
  favorite), so the vacancy does not jump into the fresh favorites.
- `countUnread` - the number of vacancies in the Unread tab (the same condition as in
  `listVacancies`, `tabCondition`) and the boundary, the database time; `markAllRead` marks
  as read the unread ones recorded up to the boundary and returns how many were marked.
  Together they are Mark all as read, see "Concurrent changes".
- `countRead` and `markAllUnread` - the same for the Read tab, without a boundary: Mark all
  as unread (task 6.18).
- `setCompanyVacanciesRead` - Mark all as read / unread for a company: `is_read` of all
  active (not Closed) vacancies of its sources in one `UPDATE`. There is deliberately no
  boundary here, unlike the bulk action: no dialog and no number, the opposite action
  undoes it easily, and a race is possible only if this very company is being checked at
  that moment.
