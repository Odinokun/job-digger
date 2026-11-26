# src/app - pages and components

The app's frontend: App Router routes, the layout and components, kept apart from
the server code in [`src/server`](../server/README.md).

## Routes

Four sections, in this menu order:

| Path         | Section   | File                 |
| ------------ | --------- | -------------------- |
| `/`          | Jobs      | `page.tsx`           |
| `/companies` | Companies | `companies/page.tsx` |
| `/history`   | History   | `history/page.tsx`   |
| `/settings`  | Settings  | `settings/page.tsx`  |

**Jobs lives at the root, not at `/jobs`.** It is the default page, so a separate
path with a redirect from `/` would add an extra hop on every visit.

The shared header and the `<main>` wrapper are in `layout.tsx`, so a page holds
only its own content, without repeating the spacing.

### Screens: what they show and what is left out

Product rules that no single component shows. How each one is built is described
in the sections below and in the READMEs of the server code.

- **An empty screen always has text**, and the text tells "no data at all" (it
  leads to Add company) from "nothing in this view" ("Everything is read"). An
  empty area without text looks the same as a failed load.
- **Jobs.** The tabs Unread · Read · Favorites · All come in a fixed order, with
  Unread as the default. Unread and Read hold active vacancies, All holds every
  active one, so Unread + Read = All. Favorites holds the starred ones, including
  those gone from the site (Closed). The counter next to Jobs and in the browser tab
  title equals the Unread tab: an unread Closed vacancy is not counted. Opening a
  vacancy does not change its Read status.
- **Jobs - what is not there:** filters by company, location or employment type, a
  choice of sort order, a vacancy export, a keyword filter at save time (every
  vacancy of a source is kept: the main use case is small companies), and
  notifications outside the app (Telegram, email, browser).
- **Companies.** Tracked holds companies with at least one tracked source; only
  they take part in Check all and auto-checks. Not tracked holds the rest, with the
  status Not checked, Not found, Unsupported, Check failed or Possible page; an
  empty Not tracked is the goal. Needs attention is a view across both
  (`needsAttentionSubquery` in `server/companies/list.ts`), and All lists every
  company alphabetically, with search. Removing the last source in Edit moves the
  company to Not tracked with the status Not checked. There is no separate page for
  a source.
- **Removing a source** in Edit also removes its vacancies, favorites included, the
  same as deleting the company. The source shows what will be lost, and the change
  applies only on Save: Save is the confirmation, there is no separate dialog. A
  source that keeps failing is never untracked automatically - that is a person's
  decision.
- **History** is kept with no time limit; Check now and Retry are not recorded there.
- **Settings** holds only personal settings: auto-check interval, language, theme,
  CSV. Concurrency, retries and limits are shared server settings in ENV and do not
  appear in Settings.

### API

| Path                  | File                          | Returns                                                       |
| --------------------- | ----------------------------- | ------------------------------------------------------------- |
| `/api/check-status`   | `api/check-status/route.ts`   | `CheckStatus`: progress of the running check and unread count |
| `/api/failed-sources` | `api/failed-sources/route.ts` | `FailedSourcesList`: the rows of the Failed Sources Drawer    |
| `/api/companies-csv`  | `api/companies-csv/route.ts`  | Export CSV - a file with `Content-Disposition: attachment` (task 6.05) |

- **Read only.** Every data change is a Server Action. Export CSV is a GET as well:
  the browser saves the file itself, without pulling it into page state. Polling is a
  GET route because the Next client sends Server Actions one at a time: polling every
  3 s would queue up behind the user's actions.
- **Origin check** - `api/same-origin.ts` (`isSameOriginRequest`), tested in
  `api/same-origin.test.ts`. Next does it on its own only for Server Actions
  ([`CLAUDE.md`](../../CLAUDE.md#security)). It checks `Sec-Fetch-Site`, not
  `Origin`: the browser sends a GET from the same page without `Origin`. Allowed are
  `same-origin` and `none` (an address typed into the browser); `same-site` is
  refused, because another program on another port of 127.0.0.1 is the same site but
  not our page. A browser without `Sec-Fetch-Site` is checked by `Origin` against
  `Host`, and a request with neither (curl on this machine) is let through.
- `Cache-Control: no-store`: the state changes every second.

## Loading states

While a page reads its data, placeholders stand in for it:

- `loading.tsx` - the Jobs placeholder: the real heading, the tabs and eight HeroUI
  `Skeleton` rows shaped like `_jobs/vacancy-row.tsx`;
- `companies/loading.tsx` - the same for Companies: four cards.

Next shows `loading.tsx` at once on navigation and swaps in the page when it is
ready (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md`).
Screen readers get `aria-busy` and a hidden `role="status"` with text.

**We draw the button spinner ourselves.** `isPending` on a HeroUI `Button` only
disables clicks (`status-pending` = `pointer-events-none`) and adds no spinner. As in
the Loading example of the Button docs, the button gets a render prop with
`<Spinner color="current" size="sm" />`. Load more (Jobs and Companies) and Check now
work this way. The modal buttons (Save, Delete) have no spinner yet.

**Read and Favorite do not wait for the server** - they are optimistic, see
`_jobs/vacancy-actions.tsx` below. Checked by hand: with the database down, the row
goes back to its previous state and a failure notification appears.

## Components

In `components/`:

- `app-header.tsx` - the header with the app name and the menu; a server component.
- `use-action-failed-toast.ts` - a hook for the notification about an unexpected
  action failure ([Errors](#errors)).
- `icon-button.tsx` - `IconButton` (an icon-only button with a tooltip) and
  `WithTooltip` (a tooltip over a button HeroUI draws itself) - see "Icon-only
  buttons".
- `header-counts.ts` - the header counters: unread vacancies for the menu next to
  Jobs and for the browser tab title ("(12) Job Digger") - `getUnreadCount`, and the
  companies needing attention next to Companies (task 6.11) - `getAttentionCount`.
  Each is one query per render thanks to React `cache`. The header lives in the root
  layout, which Next does not re-render between navigations, so **every action that
  changes one of these numbers** (vacancy marks, Mark all, company marks, Check now,
  adding, editing and deleting a company or a source) calls `revalidateHeaderCounts`,
  that is `revalidatePath("/", "layout")`. Changes made by the queue rather than by
  the user arrive through polling - see `check-status-provider.tsx`: after a general
  check it refreshes the page, and the header with it.
- `check-progress.tsx` - the "Checking 37/120" indicator in the header while a
  general check runs; a client component that takes its state from `useCheckStatus`.
  The wrapper with `role="status"` always exists and only its text appears: a screen
  reader announces changes only in a region that was already on the page.
- `check-summary.tsx` - the summary of a general check as a "Check finished" toast
  with the numbers; a client component in the root layout. A successful one closes by
  itself after 20 s (paused while the mouse is over it); one with failed sources stays,
  because it holds the button to Retry (task 6.19). It pops up once: as soon as it is
  shown, a Server Action from `check-actions.ts` (`markCheckSummaryShownAction`) marks
  it, so the next page load does not repeat it. Which summary is offered is decided in
  [`server/checks/README.md`](../server/checks/README.md#check-summary).
- `failed-sources-drawer.tsx` - the right-hand "Failed sources" drawer with Retry per
  row and Retry all failed; a client component. Show failed sources in the summary
  opens it. The list comes from `/api/failed-sources`, Retry is a Server Action from
  `check-actions.ts`. While some Retry is queued the list is re-read every 2 s; when a
  Retry ends, `router.refresh()`, because found vacancies change the counter. When no
  failed sources are left, the drawer stays open and says so. Which sources are
  listed: [`server/checks/README.md`](../server/checks/README.md#failed-sources).
- `check-status-provider.tsx` - `CheckStatusProvider` in the root layout and the
  `useCheckStatus` hook: the state of the general check for the header and the pages.
  It polls `/api/check-status` following the rules in `lib/checks/status-poller.ts`.
  Check all passes the state from its own response to `track`, so polling starts at
  once. A tab shown again (`visibilitychange`) is polled at once too. When the unread
  count changes or a check ends, the provider calls `router.refresh()`: the menu
  counter and the tab title are rendered on the server. `router.refresh()` keeps client
  state; what the shown Jobs list does with new vacancies is described in
  `_jobs/new-vacancies-notice.tsx`. Three failed polls in a row show a "Lost
  connection to the server" toast and stop polling until the page is reloaded.
- `nav-link.tsx` - one menu link, highlighted for the active section. The number next
  to Companies is a separate link to Needs attention, while the name itself leads to
  Tracked: otherwise, as long as any page went unread, Companies would open away from
  where companies are added. It is a client component (`"use client"`) because it
  reads the current path with
  [`usePathname`](https://nextjs.org/docs/app/api-reference/functions/use-pathname),
  which is deliberately unavailable in server components. Two layouts: `bar` in the
  header and `list` in the burger menu.
- `mobile-nav.tsx` - the menu on a narrow screen (below `md`, UI audit A1): a burger
  button opens a `Drawer` with the same items, and following a link closes it. At
  390 px the four sections with their counters did not fit in the header and pushed the
  page sideways. A client component.

The Jobs page lives at the root, so its components are in the private folder
`_jobs/`: the underscore keeps the folder out of routing (Next docs,
`01-app/01-getting-started/02-project-structure.md`, "Private folders"); otherwise
`jobs/` would look like a future `/jobs` route.

- `_jobs/jobs-tabs.tsx` - the Unread / Read / Favorites / All tabs as links (`/`,
  `/?tab=read` ...) with a row count next to each, as on Companies (task
  jobs-tab-counts); stateless, rendered by `jobs-board.tsx`. The space before the
  number is text, not padding, otherwise the name read by a screen reader runs
  together.
- `_jobs/jobs-board.tsx` - the heading, tabs, list and Load more; a client component
  that holds the shown rows and the cursor. Tab counts come from the server
  (`countVacanciesByTab`) and are adjusted for actions still in flight
  (`adjustTabCounts`), so the row and the number change in the same frame. The row from
  the server response is applied in its own `startTransition`: a state update after
  `await` is otherwise not part of the transition, and the number would briefly jump
  back to the old one
  ([React](https://react.dev/reference/react/useTransition#react-doesnt-treat-my-state-update-after-await-as-a-transition)).
  In Favorites it splits the list under "Last 12 hours" and "Earlier" headings
  (`isRecentFavorite`); with no recent ones there are no headings. "Now" comes from
  next-intl `useNow`, the same moment as on the server, so the boundary does not shift
  during hydration. An empty shown list takes the fresh first batch on its own (task
  6.29).
- `_jobs/new-vacancies-notice.tsx` - the `useNewVacanciesNotice` hook: an "N new
  vacancies" toast with Show in HeroUI's standard spot (task 4.13). When the unread
  count changes, check-status polling calls `router.refresh`, and `jobs-board.tsx`
  receives a fresh first batch in its props, but the shown list in state stays as it
  is - on purpose, so rows do not move while someone is reading. An empty list has
  nothing to move, so it takes the fresh batch itself, without a toast (task 6.29).
  `countNewVacancies` (`src/lib/vacancies/vacancy-list.ts`) counts the new ones; it
  says "N+" when the whole batch is new. Show swaps in the fresh batch with its cursor.
  The toast has no timer, its number updates in place, and it closes when no new
  vacancies are left or the page is left.
- `_jobs/vacancy-row.tsx` - a vacancy row: the title as a link, company, location (or
  "—"), the absolute discovery date, the Closed badge, a bolder title and a dot in the
  attention colour for unread ones, and the card background under the mouse with a
  smooth transition (task 6.19); a client component because of `useFormatter`.
- `_jobs/undo-notice.ts` - the `useUndoNotice` hook: a notification with an Undo
  button after Mark as read and Remove from Favorites (task vacancy-undo-toast): the
  action, the vacancy title, 8 seconds. While the pointer or focus is on the
  notifications the timer stops - the React Aria toast region does that itself
  (`pauseAll` in `react-aria/dist/private/toast/useToastRegion.mjs`). At most three are
  visible: a fourth closes the oldest (`keepRecentUndos`, `src/lib`), because HeroUI
  `maxVisibleToasts` only hides older ones in the stack. The keys of the open ones live
  at module level, like the `toast` queue itself. Undo in `jobs-board.tsx` restores the
  marks from before the action, together with the date added to favorites (empty for
  old favorites), and the row goes back to its place (`placeVacancy`).
- `_jobs/vacancy-actions.tsx` - the icon buttons Mark as read / unread and Favorite /
  Remove from Favorites in the row; a client component. The actions are
  **optimistic**: `jobs-board.tsx` applies the change through `useOptimistic`
  (`patchVacancy`) at once and updates the real list only on success - on failure the
  row goes back by itself and a notification appears. A row that no longer belongs to
  the tab after the action (`belongsToJobsTab`) disappears at once.
- `_jobs/mark-all.tsx` - Mark all as read in the Unread tab and Mark all as unread in
  the Read tab (task 6.18), with an `AlertDialog` confirmation showing the count; a
  client component. The click fetches the tab's vacancy count from the server, and for
  Mark all as read also the boundary of the action (database time): confirming marks
  everything recorded up to that boundary in one query, and vacancies found while the
  dialog is open stay Unread. Mark all as unread has no boundary, since a check never
  adds anything to Read.
- `_jobs/actions.ts` - the page's Server Actions: Load more, Read and Favorite, counting
  and marking for Mark all as read and Mark all as unread. Read and Favorite call
  `revalidatePath("/")` after a successful write. The row leaves the tab before the
  write, so the user can switch to another tab while the action is still running - and
  without this would see a list read before the write there (task 3.22; the E2E
  `vacancies.spec.ts` deliberately delays the actions to catch it).

An empty tab explains why: with no vacancies at all, a text and a link to Companies;
otherwise the tab's own text ("Everything is read", "No favorites yet"...).
`hasAnyVacancy` decides which.

**Time zone of the discovery date.** next-intl takes the server's time zone and
passes it to the client through `NextIntlClientProvider`, so the text does not differ
during hydration. Locally that is the user's time zone. On Vercel (stage 7) the server
runs in UTC, and the time zone will have to come from the user's settings.

The Companies page keeps its own components next to it, in `companies/`:

- `companies-tabs.tsx` - the Tracked / Not tracked / Needs attention / All tabs; a
  server component. Needs attention shows only when such companies exist or the tab is
  open. All lists every company and comes last, as on Jobs (task companies-search).
- `company-search.tsx` - search by name, only on the All tab; a client component. The
  magnifier (`IconButton`) opens a HeroUI `SearchField`, the cross closes it and clears
  the search, Escape in the field clears the text. The server searches (`listCompanies`,
  `query`), because only the first 50 companies are loaded. The search lives in the URL
  (`?tab=all&q=...`) and changes through `router.replace` after a 300 ms pause in
  typing, not on every letter. On a new search `companies-board.tsx` resets the list to
  the first batch not with a `key`, as on a tab change, but by resetting state during
  render - remounting would take the focus away from the field. A row after Add or
  Edit stays in the shown list only if it matches the search (`matchesCompanySearch`,
  the same rule as in the query). The field label is only an `aria-label`: the
  magnifier in the field already says it is a search; the placeholder is an example
  name, "e.g. Bosch" (rule 4). The field spans the row next to the cross and is 32 px
  tall like the magnifier button (`h-8` on the group, `h-full` on the field): HeroUI's
  default 36 px moved the list by 4 px as soon as search opened.
- `company-card.tsx` - the card of one company, on HeroUI `Card`. Next to a source
  whose last check failed: "Last ok: 12 days ago" or "Never checked successfully" - after
  a failure the vacancies are not deleted, and without this date dead sources would
  look alive. A page we do not read (Unsupported) is labelled in the attention colour,
  and an "N pages not read" badge stands next to the status (task 6.11); one marked
  "link only" uses the normal colour and gets no badge (task 6.17). The company itself
  (`isTrackedCompany`) decides between Check now and Find pages, not the tab: Needs
  attention mixes both kinds.
- `company-status-chip.tsx` - the status on the Tracked tab: OK, Has errors, Checking;
  a client component. `lib/companies/company-status.ts` computes the status, and
  Checking during a general check comes from `useCheckStatus`, because list rows do not
  update themselves.
- `companies-list.tsx` - the company list and the Load more button; a client component
  ([Long lists](#long-lists)). Above the list stands an `h2` with the tab name that only
  screen readers see ([Accessibility](#accessibility)).
- `add-company-dialog.tsx` - the Add button and the add modal; a client component. The
  result of Save is handled exactly once (a ref): the effect also re-runs when `onAdded`
  changes identity after a Server Action, and the repeat overwrote the row from the
  first check with the old row. The Find pages button calls `findPagesAction` (search on
  the server, `src/server/discovery`) and shows the findings under the address field.
  The name for the search comes from the name field, or, if that is empty, from the
  suggestion for the address: clicking the button takes focus off the address before
  the suggestion reaches state. Changing the address clears the findings. The
  suggestion arrives when focus leaves the address field; if focus went straight to the
  name field, it does not fill in the name - otherwise the text the user started typing
  would be glued to it ("AcmeAcme Corp", task 6.12, tested in `e2e/companies.spec.ts`).
- `found-pages.tsx` - the list of Find pages findings: the platform (or "Own page"); the
  result of the trial read - "N vacancies", "not supported yet" (an own page with no
  parser) or "couldn't read it, try again later" (the board did not answer; task 5.06);
  the address as a link to a new tab, outside the checkbox label, so a finding can be
  opened and copied before choosing it (task 6.15); and, for findings by name, the
  ownership note (task 5.05): a board that leads to the company site gets a quiet
  caption, one that leads to another site a warning naming it, unknown gets "Found by
  name - check". A client component. The checkbox is a real `<input name="foundUrl">`,
  so the chosen addresses go to Save with the form (`addCompany`, `foundUrls`). An
  unreadable finding cannot be chosen, and neither can one already tracked by another
  company: it is marked "Already tracked in ..." (task 5.08, `trackedIn` in `FoundPage`,
  filled in by `findPagesAction`), and Save would refuse it with `source-taken` anyway.
  In E2E the checkbox is ticked by clicking its label: HeroUI hides the `<input>` itself
  under the drawn checkbox, and `check()` cannot reach it.
- `edit-company-dialog.tsx` - the Edit button and the edit modal; a client component.
- `find-pages-dialog.tsx` - Find pages on a Not tracked card (task 5.14): the search by
  the company's own site and name starts when it opens, the company's existing sources
  are removed from the findings (`findPagesAction` with `companyId`), the chosen ones
  are added with one Save (`addFoundPagesAction` → `addCareerSources`), followed by the
  first check without a button, as after Add company from the Not tracked tab; a client
  component.
- `delete-company-dialog.tsx` - the trash button and the delete confirmation; a client
  component.
- `check-now-button.tsx` - Check now on a card in the Tracked tab; a client component.
  While a general check runs, the button is disabled with the tooltip "A general check
  is running": the company is being checked anyway. A disabled button gets neither hover
  nor focus, so the `Tooltip.Trigger` wrapper holds the tooltip - and since the wrapper
  is focusable, the tooltip shows from the keyboard too. If a check started after the
  click, the server answers `check-running` and the same text appears as a toast.
  `startsOnMount` is the first check of a freshly added company (task 5.09): the Add
  modal closes at once, and the button in the new card starts by itself, once (a ref
  guards against Strict Mode's double effect). If the card is not visible on the current
  tab (the company was added from Not tracked), `companies-board.tsx` calls the same
  action without a button. Whether there is anything to check comes from the Save
  response (`firstCheck`): a company without tracked sources goes to Not tracked
  unchecked.
- `check-all-button.tsx` - Check all next to Add, only on the Tracked tab, and disabled
  when the tab is empty; a client component. It queues the sources and passes the state
  from its response to `useCheckStatus().track`, so the header indicator shows at once.
  While a general check runs the button is disabled: one check per user.
- `find-new-pages-button.tsx` - Find new pages in place of Check all, only on the Not
  tracked tab (task 5.10); a client component. It queues the search and passes the
  state to `useCheckStatus().track`. The search has no run with progress, so while
  `findingNewPages` is set in the polled state the spinner turns inside the button
  itself. When the search ends, `companies-board.tsx` re-reads the shown rows, as after
  Check all (`isBusy` from `lib/checks/status-poller.ts`).
- `own-page-dialog.tsx` - Read as list on an Unsupported page row and Change list on an
  own page row (task 6.21); a client component. The dialog loads the page, shows up to
  three groups of links in a `RadioGroup` (the most likely one selected) and saves the
  chosen one as a recipe; then the board's `recipeApplied`: the row is replaced with a
  fresh one, and a company that left the tab (Needs attention, Not tracked → Tracked)
  disappears, as after Edit. The first check runs as after Add company.
- `reference-only-checkbox.tsx` - the Link only checkbox on an Unsupported page row
  (task 6.17); a client component. The action returns the company row for the current
  tab; on Needs attention it can be `null`, and the company leaves the list, as after
  Edit.
- `company-read-buttons.tsx` - Mark all as read / Mark all as unread on the card, only
  when the company has vacancies; a client component. No dialog; the result is a
  notification with the count, because nothing visible changes on the Companies page
  otherwise. The action is synchronous: the button stays in `isPending` until all of the
  company's sources are read.
- `last-checked.tsx` - "Last checked: 5 min ago" and (`message="lastOk"`) "Last ok: 12
  days ago"; a client component, because it updates `useNow` once a minute
  ([Relative time](#relative-time)).

The History page is in `history/`:

- `history/page.tsx` - a server page: the first batch from `listCheckRuns`, an empty
  state without a button (checks are started only from Companies). The table's `key` is
  the id of the newest check: when the provider calls `router.refresh()` after a check
  ends, the new check gives a new key, and the table is rebuilt from the first batch.
- `history/history-board.tsx` - the "Check history" table and Load more; a client
  component. A plain `<table>`, not HeroUI's Table: that one is a React Aria grid with
  selection and cell navigation, while here five numbers are only read. The date is
  absolute in the user's locale (`useFormatter().dateTime`), the duration in minutes
  and seconds.
- `history/actions.ts` - `loadMoreHistoryAction`, the next 20 records.
- `history/loading.tsx` - the placeholder while the server reads the checks.

- `companies/actions.ts` - the page's Server Actions: adding, editing, deleting, a
  source for an existing company, Check now, Check all, Load more and re-reading the
  shown rows after a general check.
- `form-state.ts` - the state types of these forms, kept apart from
  `companies/actions.ts` ([Modals and Server Actions](#modals-and-server-actions-two-traps)).

The Settings page is in `settings/` ([Theme switching](#theme-switching)):

- `settings/theme-switcher.tsx` - Light / Dark / System on HeroUI `ToggleButtonGroup`;
  a client component, because it sets the theme attribute at once, without waiting for
  the network.
- `settings/language-switcher.tsx` - English / Українська. The language lives in a
  cookie, like the theme (`i18n/config.ts`); the server renders translations, so a
  write is followed by `router.refresh()`. Language names are not translated: each is
  written in its own language.
- `settings/auto-check-interval-picker.tsx` - the auto-check interval: 3, 6, 12 or 24
  hours (task 6.01), optimistic; if the server did not save it, the previous choice
  comes back and a toast appears. The value lives in the `settings` table
  ([`server/settings`](../server/settings/README.md)).
- `settings/csv-export.tsx` - Export CSV: three options (Tracked, Not tracked, Include
  career page URLs) and a button that goes to `/api/companies-csv` with the options in
  the URL; the browser saves the file and the page stays where it is. With no list
  selected the button is disabled.
- `settings/csv-import.tsx` - Import CSV: a form with the file and a summary in a live
  region. The size (up to `CSV_IMPORT_MAX_BYTES`, 1 MB) is checked before sending: Next
  would reject a bigger file by itself, without a clear message. 1 MB is Next's default
  body limit for a Server Action; the original plan said 5 MB, but the limit was kept.
- `settings/actions.ts` - `setThemeAction` and `setLocaleAction` (cookie only),
  `setAutoCheckIntervalAction` (database; an invalid interval is refused) and
  `importCsvAction` (size, UTF-8, header, then `importCompanies`).

The full paths are here for a reason: there are two `actions.ts` files, so the short
name is ambiguous. [`readme-coverage.test.ts`](../readme-coverage.test.ts) accepts a
short name only when it is unique within the README.

A file in a route folder that is not named `page`, `layout` or another reserved name
does not become a route, so a page's components live next to it.

## UI rules

Agreed with the author after the UI audit ([tasks/ui-audit.md](../../tasks/ui-audit.md)).
Every new UI change follows them.

1. **A type scale of four levels**; no other sizes or weights: dialog title 20/600;
   section subheading 14/600 in the main colour; field label and body text 14/500 and
   14/400; hints and metadata 13 in the muted colour.
2. **A secondary button has a visible edge in both themes** - the `--field-border`
   border. Buttons in one row have the same height.
3. **Deleting within a row is a trash icon** through `IconButton`, always in the same
   place, whatever the length of the text next to it.
4. **A placeholder only shows a format**, starts with "e.g." and is clearly paler than
   a value. Where the label and the hint explain everything, there is no placeholder.
5. **Red is only for check errors**, yellow for "needs attention" (including an unread
   page), the same in both themes. One coloured state mark per card; everything else
   in muted text.
6. **A source address on a card is one line** with "…" and the full address in a
   tooltip; below the status line, not next to it. The full address is visible only in
   Edit company.
7. **Phone (390 px) - no horizontal scrolling**, the menu opens from a burger. Company
   cards are one column at any width, the page container is `max-w-5xl`.
8. **After any UI change** - screenshots in both themes at 1280 and 390 px before the PR.
9. **Accessibility - WCAG 2.2 AA**, details in [Accessibility](#accessibility).

## Accessibility

The goal and how it is checked: [README](../../README.md#доступність). What follows for
the code:

- **Contrast.** Text at least 4.5:1 against its background ([1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)), an icon that shows a state and a field border 3:1 ([1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast)). The limit is not rounded: 4.48:1 is a violation. Orange text and icons use `--attention`, not `--highlight` - see [Ink theme](#ink-theme).
- **Focus is visible on every button** ([2.4.7](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible)): the HeroUI focus ring is `--focus`, azure, not the colour of a filled button.
- **A target is at least 24×24 px** ([2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)). A small link outside running text (the menu counter) gets `min-w-6`.
- **Changes are announced**: check progress through a permanent `role="status"` in `check-progress.tsx` (the region has to exist before the text appears), HeroUI toasts through React Aria's `ToastRegion`, errors in dialogs through `role="alert"`.
- **Headings without skips.** Company card titles are `h3`, because HeroUI `Card.Title` renders no other tag. So above the list in `companies-list.tsx` stands an `h2` with the tab name that only screen readers see (`sr-only`). axe in E2E checks `heading-order`, although it is not a WCAG criterion.
- **Motion.** HeroUI animations turn themselves off under `prefers-reduced-motion`; the app has no motion animations of its own, only `transition-colors`.
- **Modals in E2E.** axe run in the middle of the opening animation sees text almost the colour of the background. Before scanning, the scenario waits until `document.getAnimations()` have finished.

## Ink theme

The theme lives in [`globals.css`](./globals.css) and nowhere else. Its core: **an
`--accent` without hue** - almost black in the light scheme and almost white in the
dark one. The neutrals are a cool grey with chroma up to 0.006, the radius is 4 px.
Fonts: Instrument Sans for body text, Instrument Serif for headings and company names,
IBM Plex Mono for addresses.

**Only base tokens are overridden.** HeroUI derives the rest - `*-hover`, `*-soft`,
`*-soft-foreground`, `border-secondary`, `separator-secondary` - from the base ones
through `color-mix`, so the theme does not set them. The source of truth for the list:
`node_modules/@heroui/styles/dist/themes/default/variables.css`.

**The theme blocks are outside `@layer`.** The library keeps its own in `@layer base`,
and in the cascade unlayered declarations beat layered ones, so our values override the
library's regardless of import order.

**The `accent` hue must stay away from `success` (~150), the orange `highlight` (~60-77)
and `danger` (~26).** Otherwise the "Add company" button glows in the same colour as a
"429 Too many requests" badge, and colour stops meaning anything. Free ranges: blue
230-270, cyan 195-215, violet 275-300, magenta 330-345. Ink settles the question
radically: the accent has no hue at all, so semantic colours are the only colours on
screen.

**The `--info` token and why it exists.** HeroUI would derive the "new vacancies" badge
from `--accent-soft`, and with a hueless accent the badge would come out grey. So the
theme adds its own semantic colour (azure, hue 238) and passes it to Tailwind through
`--color-info` in `@theme inline`: the `--color-*` namespace generates utilities, so
`bg-info` and `text-info` are available.

**The focus ring is `--focus: var(--info)`** (accessibility audit). HeroUI paints focus
with `--accent` by default, and in Ink the accent is the colour of the filled buttons
themselves, so focus on Add company or on the selected English merged with the button
([WCAG 2.4.7 Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible)).
Azure matches the browser's own ring on links, so focus looks the same everywhere.

**The `--highlight` token is the attention colour for fills** (tasks 4.14 and
one-orange). It marks what is waiting for the user: the Closed badge, warnings, the
indicator of the "N new vacancies" toast. The filled Favorites star and the unread row
marker are the attention colour too, but through the darker `--attention` (below). It is
not for navigation or state: the active tab is not painted with it, otherwise the signal
fades. In the dark scheme it is #ffb100, in the light one `lab(74 37.05 75.51)` (≈
#ff9918). The utilities `bg-highlight`, `text-highlight` and `text-highlight-foreground`
come through `@theme inline`, like `info`.

**One orange for fills per theme** (task one-orange): `--warning` (Closed, warnings in
Find pages, yellow toasts) points to `--highlight` rather than having a shade of its
own. There used to be three per theme, and the star next to the Closed badge looked
"almost the same" colour. No new shade of orange is introduced: adjust `--highlight` or
`--attention`. In the light scheme highlight gives 1.95:1 against the page background
and 2.1:1 against a white card - enough for a fill with dark text (8.6:1), not for text
and icons, which therefore get their own `--attention`.

**The `--counter` token - numbers in the menu (unread next to Jobs, companies needing
attention next to Companies).** Text without a fill: in the dark scheme it is highlight
itself, in the light one red (`var(--danger)`), because highlight as text has less than
3:1 where 4.5:1 is needed and, in the author's view, looks bad. Danger in the light
scheme is a pure red, #dc0000 (accessibility audit): 4.74:1 against the background,
5.21:1 against a card. The earlier #e30000 gave 4.48:1, and WCAG does not allow rounding
up to 4.5:1; #ff0000 would give only 3.6:1. The trade-off is deliberate: in the light
scheme the number has the colour of errors, but it is the only text of that colour in
the menu.

**The `--attention` token - orange for text and icons** (the Unsupported page caption on
a company card, the filled Favorites star, the unread row marker). Before the UI audit
this text used `--counter`, that is red in the light scheme, and an unread page looked
like an error; red is only for errors (audit, A6). In the dark scheme it is highlight
itself. In the light one it is #b15900 (accessibility audit): 4.88:1 against a card,
4.44:1 against the page background. Text needs 4.5:1
([WCAG 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)), a state
icon 3:1 ([1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast));
highlight gave 2.1:1.

**Field borders - `--field-border` and `--field-border-width`** (task 6.14). By default
HeroUI draws fields and checkboxes without a border (0px, transparent), and in the dark
scheme a field on a modal background vanished completely. A 1px border with at least
3:1 contrast against the surrounding background (WCAG 1.4.11); the values and the
calculation are in `globals.css`.

**Status badges are Solid.** The fill is the token itself, the text its `*-foreground`:
`bg-success text-success-foreground`, not `*-soft`. That is why the theme sets
`--success-foreground` and `--warning-foreground`, which a muted variant would not need.
In the code, Closed in Jobs and the company status
(`companies/company-status-chip.tsx`) are done this way; Checking there uses the
theme's own `info` token.

**Three families, three roles.** `font-sans` (Instrument Sans) for body text;
`font-display` (Space Grotesk 600) for `h1` and the company name in `Card.Title`;
`font-brand` (Fraunces 600) **only** for the "Job Digger" wordmark in the header. The
logo has its own family because a serif fits exactly there, while headings stay
grotesque. `font-mono` (IBM Plex Mono) for source addresses.

**HeroUI's geometry had to be overridden, and that is not tokens.** The button has
`rounded-3xl` hard-coded in its CSS, and the library computes `--radius-3xl` as
`calc(var(--radius) * 3)` - so our `--radius: 0.25rem` would give the button 12px. Hence
`--radius-3xl` is set directly in `@theme inline`; the deliberate side effect is that
modals and popovers get sharper too, since there is one radius scale for all. A card has
no border at all, only a shadow, and its radius is the button's, so `.card` is
overridden in a separate block at the end of the file.

The second such block is `.toggle-button`: the selected button in a `ToggleButtonGroup`
is filled with solid accent instead of `--accent-soft`. A hueless accent at 12% in the
dark scheme gives a fill darker than the unselected buttons, and the selection is not
visible.

After the UI audit ([rules](#ui-rules)) three more were added:

- **`.button`** - secondary buttons (`secondary`, `tertiary`) get the `--field-border`
  border, the rest a transparent one, so sizes in a row match. The block is in
  `@layer components`, and the transparent border sits under `:where()`: outside the
  layer the rule would beat utilities (such as `border-danger`) and the `outline`
  border. In the same place, `.button--icon-only` and `.close-button` do not shrink in a
  flex row: otherwise the trash button next to a long address without spaces was
  squeezed to the width of its icon.
- **`.modal__heading`, `.alert-dialog__heading`, `.drawer__heading`** - 20/600, and the
  dialog body in the main colour instead of the muted one section subheadings
  inherited. The spacing under the header also applies when a form stands between the
  header and the body (Edit company).
- **`--backdrop` in the dark scheme** - 80% black instead of 60%: over an already dark
  page 60% is barely visible.

A separate `text-hint` size (13 px) in `@theme` is for hints under fields and for
metadata (the vacancy row, "Last checked").

**Only in these blocks do we change the library's classes rather than the theme.** On a
HeroUI update, re-read them against `node_modules/@heroui/styles/dist/components/`
(`card.css`, `toggle-button.css`, `button.css`, `modal.css`, `alert-dialog.css`,
`drawer.css`).

**Hover is set explicitly.** The derived `--accent-hover` mixes in only 10%
`accent-foreground`, and on an almost black button the change is invisible. So
`--accent-hover` and `--default-hover` are set as values in the theme.

**The rejected options are kept.** Every palette, heading font and badge treatment that
was considered, with exact values, is in [theme-candidates.md](./theme-candidates.md).
The file exists because a prototype with two cards and the app with 48 companies look
different, and the decision may change after working with real data.

**The dark scheme is the `[data-theme="dark"]` block** next to the light one. The
Light/Dark/System switch in Settings turns it on ("Theme switching" below).

**There is no Cyrillic in `subsets`, on purpose.** The main version is English; if the
chosen family lacks a script, other locales get their own in a separate step.
`next/font/google` fails at build time when given a subset or a weight the font does not
have, so `npm run build` is the check of this decision.

## App icon

The letters JD in the logo font (Fraunces 700), light (#f5f5f5) on a dark square
(#0b0c0e), with a yellow dot in the attention colour (#ffb100) in the top right corner -
the same marker as on an unread vacancy (option E). One icon for both themes: the dark
background shows in both a light and a dark browser window.

The files follow the Next convention, and Next adds the tags to `<head>` itself
(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/app-icons.md`):

- `favicon.ico` - the browser tab: 16, 32 and 48 px PNGs in one file, with rounded
  corners.
- `apple-icon.png` - the iPhone home screen, 180 px. A square without rounding: iOS
  rounds the corners itself, and transparent ones would turn black there.

Both are raster images, because an SVG with text depends on the system fonts. They were
drawn once in the browser (SVG 64×64: text `x=30 y=46`, size 38, dot `cx=54 cy=10 r=5`,
corner radius 14) and captured at the needed sizes. The dot is pushed into the corner so
that at 16 px it does not merge with the D.

## Theme switching

The choice - Light, Dark or System - lives in the `theme` cookie, next to the language
([`lib/theme.ts`](../lib/theme.ts)). The `settings` table is not needed here: the theme
is more a property of the device than of the account, and a database query on every
layout render would add nothing.

**A script owns the `data-theme` attribute, not React.** This is the key decision of
this section, and it is not obvious. Rendering the attribute in `layout.tsx` from the
cookie looks simpler, but a Server Action that writes a cookie makes Next re-render the
root layout **on the client**, and that render puts the attribute back to the server
value - erasing what the switch has just set. On screen this is a flash: the theme
turns on for a split second and snaps back. For the Light / Dark pair there were two
attribute changes per click, and HeroUI played the colour transition twice - exactly
what looked like "flashing buttons".

So `<html>` is sent **without** `data-theme`, and [`theme-script.tsx`](./theme-script.tsx)
reads the cookie itself, sets the theme before the first paint and listens for changes
of the system theme. The switch sets the attribute directly, so as not to wait for the
network.

**The script is always rendered, not conditionally.** A tag that appears in the tree
during a client render is not executed by React, which logs "Encountered a script tag
while rendering React component". A conditional render did exactly that as soon as the
user switched to System.

**`suppressHydrationWarning` on `<html>`** is needed because the script sets the
attribute: the HTML on the client differs from the server's. The prop applies to this
element only, not to its children.

**The system theme cannot be asked "just like that".** In the dark theme the page
itself declares `color-scheme: dark` (HeroUI does that), and browsers report
`prefers-color-scheme` taking the declared scheme into account. So before asking, the
root is temporarily declared as `light dark`, and the answer describes the system again,
not the page. Without this, switching Dark → System on a light machine kept the dark
theme.

**The cost: the theme needs JavaScript.** Without it the page is always light. Task 2.11
planned the attribute in the SSR HTML, but that is incompatible with the client
controlling the theme, and a flash is worse than not working without JS in an app where
nothing works without JS anyway.

Why a script at all, and not a media query in CSS: in `@heroui/styles` the dark tokens
are declared with the selectors `.dark, [data-theme="dark"]`, and `prefers-color-scheme`
does not appear in the file once. Repeating the library's whole set of variables under a
media query would be impossible to maintain.

[`e2e/theme.spec.ts`](../../e2e/theme.spec.ts) catches a regression: it counts changes
of `data-theme`, not the final state - the bug never broke the final state.

## HeroUI decisions

**The library's CSS is imported whole** (`@import "@heroui/styles"` in `globals.css`),
not only the styles of the components in use. Measured on a production build: all of the
CSS is 484 KB on disk, but the browser receives **36 KB brotli** (47 KB gzip). About 16
of 86 components are used, so selective imports would save roughly 15-20 KB compressed.
Locally that is nothing, and on Vercel it is downloaded once and cached. The risk is
real, though: a forgotten import for a new component gives an unstyled component, and
neither lint nor tests catch it. Hence the refusal (task 7.10). Revisit it if the CSS
becomes noticeable on Vercel.

### Icon-only buttons

**Every button without text shows a tooltip on hover** - an app rule, without
exceptions. `aria-label` gives a screen reader a name, but a sighted user does not see
it, and an envelope or a trash can without a tooltip is a riddle.

- A regular icon button is always `IconButton` (`components/icon-button.tsx`), not
  `Button isIconOnly`: one `label` prop gives both the `aria-label` and the tooltip
  text, so they cannot drift apart.
- Buttons HeroUI draws itself (the `CloseTrigger` cross in dialogs) are wrapped in
  `WithTooltip` with the same text as their `aria-label` - "Close" / "Закрити" from
  `Common`.
- The tooltip is HeroUI's `Tooltip` (docs, Tooltip - Usage) and appears after 300 ms:
  React Aria's default 1.5 s is too long, and 0 flickers while the pointer passes by. It
  also appears on keyboard focus.

**Colours come from HeroUI tokens, not from the Tailwind palette.** `@heroui/styles`
exposes its variables as utilities (`text-muted`, `text-foreground`, `border-border`,
`bg-surface`), and these are what change with the theme. `text-gray-500` next to a
HeroUI component means two different colour sets on one screen.

**`<body>` has `bg-background text-foreground`.** HeroUI's base layer inherits only the
border colour and sets no background, so without these classes `--background` affects
nothing. The official theming guide asks for it too.

**The border colour is not set separately.** HeroUI sets `border-color: var(--border)`
on every element, so `border-b` already gives a line in the theme colour.

**The Companies tabs are navigation, not `Tabs`.** The tab lives in the URL
(`/companies`, `/companies?tab=not-tracked`, `?tab=attention`, `?tab=all`, with the
search as `&q=...`), so it can be reloaded and sent as a link, and the list stays a
server list. The semantics are also more honest: `nav` + `aria-current` describe moving
between pages, while `role="tablist"` promises switching content in place. HeroUI
`Tabs` is also `"use client"`.

**Every HeroUI component is a client component** - each file in `@heroui/react` starts
with `"use client"`. A server page can render them and pass props, but each one adds a
client layer, so we use them where they bring more than markup: the `Card` holds the
Edit, Delete and Check now buttons.

**Confirmations use `AlertDialog`, forms use `Modal`.** Deleting a company asks through
`AlertDialog`: it gives `role="alertdialog"` and a status icon, that is, a window that
demands a decision. The Add and Edit modals are plain forms, so they use `Modal`. Both
are controlled the same way, through `useOverlayState` and `isOpen`/`onOpenChange`.

**Icons are `@gravity-ui/icons`.** This is the set the HeroUI v3 docs use in their own
examples (Button - With Icons, Icon Only), so examples can be copied without
translation. HeroUI ships no icon set of its own: the exported `IconChevronDown`,
`CloseIcon` and the like are internal icons of its components. An icon-only button is
`isIconOnly` with a mandatory `aria-label`; `Button` sets the icon size itself, and we do
not touch it with classes.

**The company card has `h-full`.** HeroUI's `.card` is a flex column and
`.card__content` is `flex: 1`, so the footer with the buttons is pushed down by itself.
Only the height is missing: a grid item stretches, but the card inside keeps the height
of its content, and without `h-full` neighbouring cards in a row come out different.

**The menu is written by hand, not with a HeroUI component.** HeroUI v3 has no `Navbar`
(v2 had one), and its `Link` is a react-aria-components primitive: to route its `href`
through the Next router, the app would have to be wrapped in a `RouterProvider`. For
four links that is an unnecessary client layer, so we use semantic `<header>`/`<nav>`
and `next/link`, which also prefetches.

Menu texts come from next-intl: `getTranslations` on the server, keys in `messages/` at
the root ([localization](../../README.md#локалізація)). Client components use
`useTranslations`: `NextIntlClientProvider` in `layout.tsx` passes the translations down
itself, so no props with texts are needed.

## Adding a company

**The Server Action lives in `src/app`, not in `src/server`.** That is where the docs of
the installed Next put it (`app/posts/actions.ts` in
`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`), and the project rule
stays intact: a client component imports the action from `src/app`, and the action
calls `src/server`. `actions.ts` itself decides nothing - it reads the fields and hands
the work to `addCompany` ([details](../server/companies/README.md)).

**Success does not return the company row.** Whatever an action returns is serialized
and sent to the client, so the form state is `idle`, `added` or `failed` with a reason,
not a database record.

**Success closes the modal, not the button.** Until the company is saved, the user must
see their data and the messages, so the window is controlled (`useOverlayState` +
`isOpen`/`onOpenChange`), and a `useEffect` closes it on `added`.

**A field error goes to `FieldError` together with `isInvalid`.** The
`validationErrors` prop described on the HeroUI site lives on `Form` in the installed
3.2.x, not on the field - the `TextFieldRootProps` types do not have it.

**The fields are filled in from one pasted address.** The address is the first field,
and when focus leaves it the modal calls `suggestCompanyFields`
([`lib/companies`](../lib/companies/README.md)): the main site is cut down to the
domain, the name is guessed from the domain or the ATS slug, and the rest of the address
goes into the career page field. There is no network request: the real Find pages came
in stage 5 (task 5.07), and this heuristic stays for cases when the site does not
answer.

**One suggestion per pasted address.** Otherwise a user who added a path to the domain
(`bosch.com` - `bosch.com/careers`) would see the address cut again. The flag resets
when the address field is cleared: what comes next is another company. The suggestion
does not write into the name and career page fields if the user has already typed
something there.

**The fields are controlled, and the form is cleared when the modal opens.** The
suggestion writes into the fields, so state is unavoidable, and controlled fields do not
clear themselves after closing. The reset sits in the Add button, not in an effect on
`added`: `setState` in an effect causes a cascading render, which
`react-hooks/set-state-in-effect` catches.

**"Already added" is no longer a dead end.** The modal offers to save the pasted address
as one more career page of the existing company - with a button that calls a separate
action (`addCareerSourceAction`) rather than submitting the form again, which would hit
the same refusal. The offer appears only when the career page field is filled: if the
user pasted only the main site, there is nothing to add as a source.

**The offer works on two signals.** An exact match with the site of an existing company
(task 2.16) and a match by name (task 2.17). The second is needed because a company
publishes vacancies on several platforms: pasting `jobs.ashbyhq.com/linear` while a
"Linear" card exists, the user wants to put the address there, not create a second
"Linear". There is one button per company found: there may be several with the same
name, and only the user knows which one is meant.

**The offer stands below the warnings, not above them.** First "such a company already
exists" with the list, then "here is what you can do about it". Save stays next to it -
in case this really is another company with the same name.

**The label is set right here.** The offer has a label field, the same as in the Edit
modal: without it, three filters of one mozilla.org page would again be impossible to
tell apart, and the fresh addition would have to be fixed in a second modal. The label
texts are shared by both windows (`CompaniesPage.sourceLabel`).

**The company row is replaced, not added.** The company is already in the list, so the
action returns `companyId` apart from the row: when the company does not belong to this
tab, the row comes as `null`, and it is exactly this company that has to be removed.

## Editing a company

The Edit modal has the company's name and site, a label for each career source, their
removal and a block for adding a new page. What the server does with all this is in
[`server/companies`](../server/companies/README.md).

**Name and site are required - here and in Add company** (task company-site-required, UI
audit B4): Save is disabled while either is empty, so an empty Save that never said what
was missing is impossible. An ATS link in the site field of Add company fills in the
career page and the name, and the user types the company site themselves. The name and
site fields in Edit are controlled - the disabled Save is computed from them.

**The label is how the user tells sources of one site apart.** Three filters of
`mozilla.org/en-US/careers/listings/` differ only in `query` and look the same in the
list. Every source has a label field, not just the new one: the first Mozilla source was
added earlier, and without this it could not be labelled at all.

**The label fields and the add block are controlled.** React resets an uncontrolled form
after submission, so on a refusal (a bad address, a duplicate) the user would lose what
they typed. The state resets when the modal opens, as in Add company.

**The source id is part of the field name** (`sourceLabel.<id>`), not a separate
parallel array: `FormData` does not guarantee that two arrays arrive with the same
length, and a label could end up on someone else's source. The ids themselves are
untrusted input, and the query checks them.

**The label of a source marked for removal is not sent.** The field becomes
`isDisabled`, and a disabled field does not get into `FormData`, so there is no need to
remove it from the form separately.

**The source row on a company card** (UI audit, B1): at the top the platform or state,
the label and the failure; below it the address - always one line with "…", since with
filters it can run to four or five lines; below that the source actions (Read as list,
Change list, Link only) as one group. The full address is in the browser tooltip
(`title`) and in full in the Edit modal. The gap between sources is bigger than inside a
source. On the left of the footer there is one coloured badge (`cardStatusBadge`,
`lib/companies/company-status.ts`); unread pages next to Checking or Has errors are
plain text.

**Address refusal texts are shared by both modals** (`CompaniesPage.urlErrors`, mapped
in `companies/url-errors.ts`): "Enter an address" does not depend on whether a company
or a career page is being added.

## Relative time

"Last checked: 5 min ago" is counted from "now", and the server and the browser render
the card at different moments. To keep the text the same during hydration, "now" is one
per request: `src/i18n/request.ts` sets `now`, and `NextIntlClientProvider` in the layout
passes it to the client ([next-intl docs](https://next-intl.dev/docs/usage/configuration#now)).
`useNow({ updateInterval })` in `last-checked.tsx` starts from that value and then
updates once a minute.

A check that has just finished has a time slightly later than that "now" - without a
correction it would read "in 2 sec". So the future is capped at the present, and the
label says "now".

## Errors

There are two places where the user learns about a failure: a **notification** for an
action that failed, and a **screen with a "Try again" button** for a page that did not
render.

**An expected refusal and an unexpected failure are different things.** An input
refusal (`name-required`, a bad address, a company already added) belongs to a form
field: the user sees it next to the field and can fix it. An unexpected failure - the
database not running, a failed query - cannot be fixed, so it shows as a notification,
and the modal stays open with the data already entered.

**An exception from a Server Action never reaches the UI.** In production Next keeps
only its `digest`, so there is nothing to show the user. `runAction`
(`action-result.ts`) catches the exception on the server, logs the real error with
`console.error` in English and returns `{ ok: false, error: "unexpected" }` - only the
code goes to the client. The Server Action turns it into its own state
(`failed-unexpectedly` in the add form), and `useActionFailedToast` shows a
`toast.danger` with text from next-intl.

**`Toast.Provider` sits in `layout.tsx` without the `queue` prop.** It then renders the
same global queue the exported `toast` writes to, so a notification can be shown from
any client component without passing the queue down in props.

**`error.tsx` is the app-level error boundary.** In Next 16 the retry prop is called
`retry`, not `reset` as before; Next generates no type for the file, so the props are
written by hand from the docs of the installed version
(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`).

**There is deliberately no `global-error.tsx`.** `error.tsx` wraps pages and nested
layouts, but not the layout it lives in. Our root layout does not touch the database -
it only reads the locale from a cookie - so a second file with its own `<html>`,
`<body>` and untranslated text would be dead code for now.

**One text for every unexpected failure.** The user does not care whether the database
or a query failed: they can do the same thing either way - try again. The error codes in
English stay in the server log.

## Long lists

**The first batch comes from the server, the rest from a button.** The page renders the
first 50 companies in a server component, and the Server Action
`loadMoreCompaniesAction` loads further batches. The cursor mechanics are in
[`server/companies`](../server/companies/README.md), the cursor itself in
[`lib/pagination`](../lib/pagination/cursor.ts).

**The list is a client component, because Load more adds rows to those already
shown.** The cost: the extra rows disappear on reload, since the URL keeps only the tab.
Tabs, on the other hand, live in the URL, so switching between Tracked and Not tracked
reads its own first batch from the server.

**`companies-board.tsx` holds the shown rows, not the list itself.** Three actions
change them - Add, Edit and Load more - and the Add button lives in the page header,
outside the list. While the state lived in the list, an added company did not appear
until the page was reloaded. The board renders the header with Add, the tabs (they are
server-rendered and come in as a prop) and the list; `companies-list.tsx` is left with
the markup only.

**Every action returns the row it touched.** A page refresh does not touch the list - it
is built from its own state - so Add and Edit return a `CompanyListItem` for the current
tab, or `null` if the company no longer belongs there, and the board replaces exactly
that row and re-sorts what is shown (`compareCompanyRows`). `revalidatePath` stays for
the tab counts, which the server renders. Resetting the whole list instead is not an
option: a user who scrolled to the two-hundredth company would be sent back to the first
fifty.

**After a general check the board re-reads what is shown.** The queue, not a user
action, changes statuses and "Last checked", so there is no response row. When polling
sees that the check has ended, `reloadCompaniesAction` returns as many companies from the
start as are already shown (at most 500), so loaded batches stay.

**`key={tab}` on the board.** The state is no longer reset by a page refresh, so
something has to keep the rows of one tab from leaking into another.

**Batches are kept in `useState`, not `useActionState`.** The latter passes the previous
state into the Server Action, that is, it would send every shown company to the server
and back on each click. `useTransition` stays - it provides `isPending` for the button.

**Server Action arguments are untrusted.** `loadMoreCompaniesAction` takes them as
`unknown` and parses the tab and the cursor itself, because a Server Action can be
reached with a direct POST request, not only through the button ("Server Functions are
reachable via direct POST requests" -
`node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`). The
function takes the user on the server and never accepts it from the client.

**The list row types live in `src/lib`.** A client component does not import from
`src/server`, so `CompanyListItem`, `CompaniesTab` and the `discovery_status` values moved
to [`lib/companies/company-list.ts`](../lib/companies/README.md), the same way as the list
of platforms.

## Modals: scrolling and form submission

**The form is submitted by hand, not through `action={submit}`.** After the action
finishes, React calls `reset` on the form, React Aria sees that event and reports
`onChange("")`, so the input vanished even from controlled fields. Because of this the
"already added" refusal lost the career page address, and the offer to add it as a
source never appeared. Now `onSubmit` prevents the default and calls the action itself,
always inside `startTransition`: outside it `isPending` from `useActionState` does not
update, and React logs a warning about it. This costs no progressive enhancement -
JavaScript opens the modal anyway.

**A refusal does not survive closing the window.** `useActionState` lives as long as the
component, and the modal is only hidden, so opening it again showed last time's refusal
- "Already added as ..." before the user typed anything. A "form submitted since
opening" flag resets together with the fields, and the error text takes it into account,
not just the action state.

**The window scrolls inside** (`scroll="inside"` on `Modal.Container`): otherwise
`modal__dialog` clips the content (`overflow-clip`), and for a company with three sources
the add block and the buttons ended up below the bottom edge of the screen, out of
reach.

**The form itself has to be a flex column** (`flex min-h-0 flex-1 flex-col`). It stands
between `Modal.Dialog` and `Modal.Body`, and HeroUI limits the height through the
dialog's flex column: without this, `flex-1 min-h-0` on the body attaches to nothing, and
scrolling inside the window does not work even though the classes are there.

**Addresses are checked when focus leaves the field** - in Add company (company site,
career page) and in Edit (the new source's address) - with the same pure logic the
server applies later (`normalizeCompanyUrl`, `prepareCareerSource`). An empty field is
not treated as a refusal: Save will report a required address, not leaving a field where
nothing was typed yet. In the site field the check sits next to the suggestion and works
on the typed value, so cutting the address down to the domain does not confuse it. This
does not replace the server check - the fields come from the client - but `ftp://` and a
duplicate show up at once, not only after Save. Sources marked for removal are left out
of the check, as on the server.

**The source row in Edit is a grid** (UI audit, A5): on the left the platform and the full
address, wrapped (`break-all`) - only here is the address visible in full, on the card it
is truncated; on the right a red trash button (`IconButton`), always in the same place.
Before, a text Remove button stood right after the address and wrapped to a new line
depending on its length. A marked source is struck through, and the button shows a
"back" arrow with the tooltip Keep. The trash colour comes through `--button-fg`:
`text-danger` alone loses to `color: var(--button-fg)` from the button's base class. The
label field has a visible "Label" label, not a placeholder.

**A placeholder only shows a format** (rule 4): `e.g. bosch.com` in address fields. The
company name and the source label have no placeholder - "Bosch" and "Remote Canada"
looked like values already entered.

## Modals and Server Actions: two traps

**A file with `"use server"` may export only async functions.** A constant with the
form's initial state is already an error, "A "use server" file can only export async
functions, found object" ([reference](https://nextjs.org/docs/messages/invalid-use-server-value)),
and the module does not load at all: both the page render and the action itself fail.
Types are erased at build time and pass, but keeping them apart is simpler than
remembering the difference, so form states and their initial values live in
`companies/form-state.ts`, and `actions.ts` holds only the actions.

**`useOverlayState` returns a new object on every render.** `open` and `close` themselves
are stable (`useCallback`), but the object around them is not. An effect with the whole
`overlay` in its dependencies re-runs on every render, so after a successful save it also
fires when the modal opens, sees the old success and closes the window instantly - the
button looks dead. So the dependencies hold `const closeDialog = overlay.close` taken on
its own.
