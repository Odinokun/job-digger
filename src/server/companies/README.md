# src/server/companies - companies

The server side of companies: finding conflicts with companies already added, the lists
for the Companies page, adding, editing and deleting. Working with the address string
itself (cleanup, the platform, field suggestions) is in
[`lib/companies`](../../lib/companies/README.md), the tables and the decisions about them
in [`db`](../db/README.md), the add-company flow in
[`src/app/README.md`](../../app/README.md#adding-a-company).

## Files

| File            | Contents                                                         |
| --------------- | ---------------------------------------------------------------- |
| `duplicates.ts` | `findCompanyUrlConflict` - what already exists among the user's companies |
| `list.ts`       | `listCompanies`, `findCompanyInTab` and `countCompaniesByTab`; the Needs attention tab - `needsAttentionSubquery` (task 6.11) |
| `add.ts`        | `addCompany` - adding a company with the career page from the field and the chosen Find pages findings |
| `update.ts`     | `updateCompany` - renaming, removing and adding career sources   |
| `sources.ts`    | `addCareerSource` - a source for an existing company; `addCareerSources` - several in one Save, all or nothing (Find pages on Not tracked); `companySources` |
| `reference-only.ts` | `setSourceReferenceOnly` - the "link only" mark on an Unsupported page (task 6.17) |
| `own-page.ts` | `previewOwnPage` - the link groups of an own page for the Read as list dialog; `applyOwnPageRecipe` - saves the chosen prefix as a recipe (task 6.21) |
| `page-platform.ts` | `platformsByPage` - a page's platform by its content, for addresses that are `unsupported` by host (task 5.13); `withPagePlatform` - applies it to a source before the insert |
| `page-platform.integration.test.ts` | `platformsByPage` through the fake web server |
| `delete.ts`     | `deleteCompany` - a company together with all its sources        |
| `source-duplicates.ts` | `findCompanyWithSource` - who already has this career source; `findCompaniesWithSources` - the same for a list of addresses in one query |

## Decisions

**The platform comes from the address, and when the address says nothing, from the page**
(task 5.13). PeopleForce on the company's domain (`peopleforce.softconstruct.com`) cannot
be recognised by the host, and without this the source would become Unsupported. So before
adding (`addCompany`, `addCareerSource`, `addCareerSources`, `updateCompany`) the Server
Action loads every address that is `unsupported` by host and passes what it recognised in
the `pagePlatforms` parameter. The request happens before the transaction, because another
site may take until the timeout to answer. Find new pages does not load the pages a second
time: the search already knows the finding's platform. Addresses of known ATSs are not
loaded at all, and `pagePlatforms` does not overwrite their platform. CSV import does not
load pages: a file is dozens of addresses, and the import would drag on for minutes; such
a page stays Unsupported until Find new pages finds it.

**Three kinds of conflict, of different strength.** `exact` (the same site) blocks adding.
`same-domain` only warns: several different companies can live on one domain. The same
name is a warning too, and the weakest signal of the three, so it is checked last
(`findCompaniesByName`). The name comparison rule itself is in
[`lib/companies`](../../lib/companies/README.md#when-two-names-are-one-company).

**One confirmation for both warnings.** The `confirmed` flag gets past both `same-domain`
and `same-name`: the user clicks Add anyway once and expects the company to be saved, not a
second warning to pop up. It does not get past an exact address match.

**The domain is computed in SQL with `split_part`**, not searched for as `like
'bosch.com%'`: otherwise `bosch.com.ua` would count as the same domain as `bosch.com`. A
full scan of a few hundred rows is cheaper than a separate domain column; if the company
list ever grows enough for this to be noticeable, we will add an indexed column then.

**The code sets the order of companies in the warning** (`order by name`), not the
database. Without an explicit order PostgreSQL returns rows as it pleases: the order test
passed by chance for a while and failed only when the order was checked with a mutation.

## Lists for the Companies page

**A tab is a query, not a column.** Tracked means "has at least one source with
`is_tracked`", Not tracked "has none", so a company whose only page is not supported stays
in Not tracked, and its address is kept.

**Sources come in a second query** with `in (...)`, not a join: a join would repeat the
company row for every source, and `json_agg` would complicate the query for the same
result on fifty rows.

**Vacancy counts come in a third query**, grouped by company: `vacancies` →
`career_sources` → `company_id`, how many in total and how many with `is_favorite`. A
company without vacancies gets zeros. The numbers travel with the list row (`vacancies` in
`CompanyListItem`), so the delete dialog takes them from there without a separate query.
`findCompanyInTab` counts the same way - both go through one `attachDetails`.

**The company's last check** (`lastCheckedAt`) is the latest `last_checked_at` among its
sources, computed in code from the same sources query. `null` - no source has been checked
yet. Check now writes it ([`checks`](../checks/README.md)).

**A source's check state** - for the company status and "Last ok". `lastCheck`: `null` -
never checked, `failed` - `consecutive_failures > 0`, otherwise `ok`. `lastSuccessAt` - as
is. `isChecking` - the source has a `queued` or `running` task; computed with an `exists`
subquery, and the table names in it are written explicitly: in a single-table query
Drizzle writes columns without them, and `"source_id" = "id"` would compare columns of
`check_tasks` itself (a test for this would fail). The company status itself is put
together by [`lib/companies/company-status.ts`](../../lib/companies/company-status.ts).

**Both counters are computed in one query**, because both numbers stand in the tab names
at the same time.

**The code sets the order** (`order by name`), not the database. Without an explicit order
the sorting test passed by chance - and failed only after the order was checked with a
mutation.

**A batch is 50 companies, and a cursor, not a page number, sets where to continue.**
`listCompanies` takes `after` - the "name + id" pair of the last shown row - and returns
`{ items, nextCursor }`. We do not use `OFFSET`: it shifts when companies are added during
browsing, so the same company could come twice or not at all.

**The cursor condition compares a pair** `(name, id) > (key, id)` rather than two
conditions joined with `OR`: in PostgreSQL this is exactly "the next row in the same
order". Hence also `order by name, id` rather than just `name`: the name is not unique, and
without `id` the order of companies with the same name is undefined, and the cursor would
lose rows at the batch boundary.

**We learn that there is more with one extra row:** the query reads `limit + 1`, and
`nextCursor` is set only when that row arrived. A separate `count` on every Load more would
cost more, and the button needs only the fact.

**The cursor comes from the client**, so `listCompanies` runs it through `parseCursor`
([`lib/pagination`](../../lib/pagination/cursor.ts)): an unusable value means "start from
the beginning", not an error.

**Name search** (`query`, the All tab, task companies-search) is `ilike` on
`companies.name`: the name contains the search string regardless of case. `%`, `_` and `\`
in the string are escaped with a backslash, so "50%" looks for exactly "50%", not for
everything. The string is trimmed at the edges and to 100 characters; an empty one adds no
condition. The next batch asks for the same `query`; the cursor does not depend on the
search. The All tab is `tabCondition` without a condition; its number in
`countCompaniesByTab` is `count(*)`. The same rule on the client is `matchesCompanySearch`
(`src/lib/companies/company-list.ts`).

**`findCompanyInTab` reads one row separately.** After saving in the Edit modal or adding a
company, the list replaces exactly that row without re-reading the loaded batches. `null`
means "the company no longer belongs to this tab": without tracked sources it moved to Not
tracked, so the row has to be removed. The user condition is in the same query, so another
user's company is simply not found.

## Editing a company

`updateCompany` renames the company and removes the marked sources **in one transaction**:
otherwise a refusal over an empty name would leave the sources already removed.

**The `UPDATE` itself checks access.** The condition `id = ? and user_id = ?` together with
`returning`: someone else's row is not updated and returns nothing, so no separate check
query is needed, and the `not-found` response is the same for a company that does not
exist and for someone else's - otherwise it would hint that such a row exists.

**Removing sources is limited to the company.** `company_id` in the condition is required:
the source ids come from the client, and without it a source of another company could be
removed.

**A new source is added by the same Save.** Besides Find pages, this is how a company gets
a second source by hand - for example, three filters of one `mozilla.org` page (task 2.16).
`prepareCareerSource` from [`lib/companies`](../../lib/companies/README.md) prepares the
address, the label and the platform, so the same rule works in the Add company modal's
offer too.

**An existing source's label is saved by the same Save.** The form sends the fields of all
sources, so an empty label means "remove the label", not "leave it alone". There are as
many updates as fields in the modal: a company has a handful of sources, and one `UPDATE
... CASE` is not worth it. `company_id` in the condition is required - the source ids come
from the client, and without it a source of another company could be labelled.

**The source address is checked before the transaction**, as in `addCompany`: otherwise a
refusal over a bad address would leave the company already renamed and the sources already
removed.

**A duplicate is looked for among the sources that remain after this Save.** Sources marked
for removal are left out of the list, otherwise replacing an address with the same one would
run into a source that is about to disappear. The query goes through `companies` with a user
condition: without it the answer "such a source already exists" would tell about someone
else's company.

**Adding by hand does not touch the search status.** A company with `not_found` and a new
source goes back to Tracked, but the status itself stays: there was no search anyway, and
the Tracked tab does not show it.

**Without sources the search status resets** to `not_checked`: the company ends up in Not
tracked, and the previous `not_found` or `check_failed` no longer describes it.

**A company whose last source was removed stays - in Not tracked.** We did not forbid the
Save: the Not tracked tab is exactly where the user decides what to do with the company -
add a career page through Edit or delete it with the trash button.

**The site is editable** (task company-site-required): `url` in `updateCompany` is the site
from the modal field, `undefined` - do not change it. Empty or unusable - `company-url`, as
in `addCompany`; the site of another company of the user - `already-added`; its own
unchanged one - not a conflict. "The same domain" does not warn here: this is an edit of an
existing company, not a new card. The check happens before the transaction, so a refusal
does not do half the work.

The vacancies of a removed source, favorites included, go with it:
`vacancies.source_id` is `on delete cascade`. The rule is the same as for Delete company.

## A career source already in another company

`findCompanyWithSource` answers whether this source already belongs to some company of the
same user. All three paths by which a source gets into the database call it - `addCompany`,
`updateCompany` and `addCareerSource` - each inside its own transaction: the company could
be deleted between the check and the insert.

**Why.** The same company can come under different sites (`spotify.com` and `spotify.se`) -
then the site check does not recognise it, and adding `jobs.lever.co/spotify` a second time
would give two "Spotify" with double checks. This check appeared together with companies
without a site (task 2.17); the site is now required (task company-site-required), but the
scenario with different sites remains.

**The `source-taken` refusal names the company** that already has this source - unlike
`source-duplicate`, where the page belongs to this very company and is visible in the list
above.

**`exceptCompanyId`** excludes the company the source is being added to: its own sources
are a duplicate within the company, and there is a separate refusal for that.

**The Find pages findings list** marks such sources "already tracked in ..." (task 5.08)
through `findCompaniesWithSources`: one query for all findings, keyed by the address as
passed. Such a finding cannot be chosen - Save would refuse it with `source-taken` anyway.

Why the check is friendly rather than a unique index:
[`db/README.md`](../db/README.md#schema-decisions).

## Deleting a company

`deleteCompany` is one `DELETE` without a transaction: `ON DELETE CASCADE` on
`career_sources.company_id` removes the sources ([`db`](../db/README.md)), and the same
cascade on `vacancies.source_id` removes the vacancies, including those in Favorites. The
dialog knows how many will disappear from the list (`vacancies` in the company row). The
historical aggregated check statistics stay: the History counters are stored in the
`check_runs` row, not computed from the `check_tasks` that disappear with the sources.

**The `DELETE` itself checks access**, as in `updateCompany`: the condition `id = ? and
user_id = ?` together with `returning`. Someone else's row is not deleted and returns
nothing, so `not-found` is the same for a company that does not exist and for someone
else's.

## Adding a company

`addCompany` is the whole server side of the Add company modal, except the search itself
(`src/server/discovery`). The sources are the career page from the field and the chosen
Find pages findings (`foundUrls`): each is checked the same way as the field
(`career-url`, `source-taken`), and the same page written differently is one source. The
platform of each source is derived from the address, and `discovery_status` stays
`not_checked`: the search statuses are set elsewhere (task 5.11).

**A refusal is a result, not an exception.** The modal has to show every case
(`name-required`, `company-url`, `career-url`, `already-added`, `same-domain`, `same-name`,
`source-taken`), so they live in the `AddCompanyResult` type and cannot be missed. The
message texts live in the translations, not here.

**The site is required** (task company-site-required): an empty field is `company-url`
with the reason `empty`, like an unusable address. The career page is optional. Before, a
company could have no site (task 2.17) - a company found only on an ATS was identified by
its source; without a site the search for pages on the site does not work, and the author
decided to require it. In the modal Save is disabled until there is a name and a site.

**`same-domain` is a warning, not an error.** The first Save returns the list of companies
on the same domain, a repeated one with `sameDomainConfirmed` saves. An exact match
(`already-added`) does not pass even with a confirmation.

**All input checks happen before the first insert**, and the company with its source are
written in one transaction: otherwise a bad career address would leave a company without a
source in the database.

**The address is stored in absolute form** (`absoluteCompanyUrl`): without a protocol the
`<a href>` in the company list would become a relative link. The comparable form lives
separately, in `normalized_url`.

**The unique index, not the check, has the last word.** `findCompanyUrlConflict` runs
before the insert and gives a friendly text, but it cannot be atomic: between the check and
the insert another request may add the same company. So the insert goes with `on conflict
(user_id, normalized_url) do nothing`, and if it returned nothing, the company is re-read
and the same `already-added` is returned. The result does not depend on who won the race,
so the app copes with several users and several tabs of one user.

A test with two connections covers this: the other one holds an uncommitted insert,
`addCompany` queues behind the index lock, and only after `commit` gets `already-added`.
The test waits for the lock moment by polling `pg_stat_activity`, not with a timer -
otherwise it would pass through the friendly check and say nothing about the race. The
polling happens outside a transaction: inside one, the statistics come from a cached
snapshot in which the other connection is not there yet.

## A source for an existing company

`addCareerSource` is needed where the company is not being edited: the Add company modal,
having recognised the pasted address as an existing company, offers to save this address as
one more source instead of a dead end (task 2.16). The same rule as in `updateCompany`,
because `prepareCareerSource` prepares the address for both.

**The access check and the insert are in one transaction.** They are two queries: without a
transaction the company could be deleted between them, and the source would be left without
it.

**The refusals are named the same as in `updateCompany`** (`not-found`, `source-url`,
`source-duplicate`): the modals show the same texts, and two sets of names for one action
would drift apart.

**`companySources` does not check access** - the caller does: `addCareerSource` with a
separate query by `(id, user_id)`, `updateCompany` with the condition of the `UPDATE`
itself. So `updateCompany` reads the sources with its own query through `companies`: it
needs exactly the user condition, otherwise the answer "such a source already exists" would
tell about someone else's company.

## Boundaries

`findCompanyUrlConflict` takes an **already cleaned** address: cleaning and searching are
two separate steps, because the cleaned form has to be stored in `companies.normalized_url`
anyway.

The message texts ("Company already added", "This domain already has: ...") and showing
them are the Add company modal's job, not these modules'.
