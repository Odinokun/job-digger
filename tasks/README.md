# Tasks

The source of truth for the project's tasks: what has to be done, what is in progress and
what is finished. One file is one task (a former Trello card), and **the status of each
task lives only in the table below**. The Trello board "JD - Job Digger" stays as an
archive and is no longer updated. Tasks finished before the move were not carried over:
their checklists are in Trello, and their code and descriptions are in the merged PRs.

**The task files are in Ukrainian**, the author's working language: they are working
notes, kept as they were written. This README, the code and the rest of the
documentation are in English.

## Statuses

- `analyze` - an idea that came up during development, not thought through and not in
  the plan yet; after a discussion it moves to `backlog`.
- `backlog` - a task from the plan.
- `todo` - taken into the nearest work.
- `done` - finished.
- `cancelled` - dropped without code; the reason is in its file (for example, a service's
  terms forbid automated reading, 6.22-6.24).

The status and the checklist change in the same PR as the task's code, and a task gets
`done` with the last commit of its branch. That is why the table in `main` is always
true: a task becomes `done` exactly when its PR is merged.

There are no separate "in progress" and "in review" statuses in the table: they would
never reach `main`, because nothing is committed there directly. A task in progress is
its branch, a task in review is an open PR (`gh pr list`).

## Task file

The name is `N.MM-slug.md`: the task number and a short summary in English, like a
branch name (`2.07-csv-import.md`). A task without a number - an idea in `analyze` or
work outside the stages - is named just `slug.md`; it gets a number when it moves into a
stage.

```markdown
# 2.07 Імпорт CSV

**Етап 2 — Компанії** · строго TDD

Що робимо і навіщо. Де важливий порядок - «брати перед X.YY».

PR: #57

## Кроки

- [x] Парсер рядка
- [ ] Валідація
```

The first line of the description names the stage from ["Stages"](#stages) below (in
Ukrainian, like the rest of the file). The `PR:` line appears when the PR is opened. The
steps are written down when the task is taken into work.

A new task is a new file and a new row in the table. Numbered tasks go by number, tasks
without a number go at the end.

## Stages

The stage number is the first digit of the task number. At the end of a stage all its
tests, the stage's E2E scenario included, are green
([`CLAUDE.md`](../CLAUDE.md#tests-and-tdd)).

**The local version first** (the author's decision of 18.11.2026). Stages 3-6 bring the
app to daily use on one's own computer, and stage 7 - moving to Vercel and sign-in -
comes at the very end. Locally there is no need for sign-in: the data belongs to one
system user.

1. **Foundation** - Next.js, HeroUI, Tailwind, TypeScript, Drizzle, PostgreSQL in
   Docker, navigation and localization, Vitest and Playwright, `CLAUDE.md`, GitHub
   Actions, skills.
2. **Companies** - the data model, the Companies page, adding a career address by hand,
   editing and deleting.
3. **Parsing and vacancies** - ATS parsers, the request module with politeness and SSRF
   protection, pagination, the vacancy lifecycle, the Jobs page, Check now. The first
   working version: add an address - see vacancies.
4. **Queue and checks** - the queue, Check all, concurrency, retries, progress, the
   Failed Sources Drawer, History.
5. **Career page search** - platform detection, source search, the trial read, the
   ownership check, Find pages, Find new pages, duplicates.
6. **Automation and Settings** - the schedule, the check on start, limits through ENV,
   Settings, CSV. Plus everything for daily use (the author's decision of 20.11.2026):
   a working instance with its own database, backups, autostart, pages we do not read,
   parsers for real sources.
7. **Preparing for Vercel** - Neon, Vercel Schedules, queue self-restart, function
   limits, data migration, Google sign-in. The stage's rules are in the 7.xx task files.

The technical plan the stages grew from was deleted once its content moved into the code
and READMEs (task [remove-docs-plan](remove-docs-plan.md)). Its last version is at the
[`plan-v1.4.0`](https://github.com/Odinokun/job-digger/tree/plan-v1.4.0/docs) tag.

## Board

| Task                                                                                       | Status    |
| ------------------------------------------------------------------------------------------ | --------- |
| [2.08 E2E: add, edit and delete a company](2.08-e2e-company-crud.md)                       | done      |
| [3.01 Fake server with platform responses](3.01-fake-platform-server.md)                   | done      |
| [3.02 Polite HTTP request module](3.02-polite-http-client.md)                              | done      |
| [3.03 SSRF protection](3.03-ssrf-protection.md)                                            | done      |
| [3.04 The vacancies schema](3.04-vacancies-schema.md)                                      | done      |
| [3.05 URL cleanup and the internal vacancy key](3.05-url-cleanup-vacancy-key.md)           | done      |
| [3.06 Greenhouse parser](3.06-greenhouse-parser.md)                                        | done      |
| [3.07 Lever parser](3.07-lever-parser.md)                                                  | done      |
| [3.08 Ashby parser](3.08-ashby-parser.md)                                                  | done      |
| [3.09 Workday parser](3.09-workday-parser.md)                                              | done      |
| [3.10 PeopleForce parser](3.10-peopleforce-parser.md)                                      | done      |
| [3.11 schema.org JobPosting parser](3.11-schema-org-jobposting-parser.md)                  | backlog   |
| [3.12 Pagination with a 5-page limit](3.12-pagination-limit.md)                            | done      |
| [3.13 Vacancy lifecycle](3.13-vacancy-lifecycle.md)                                        | done      |
| [3.14 Check now for one company](3.14-check-now-company.md)                                | done      |
| [3.15 The Jobs page with four tabs](3.15-jobs-page-tabs.md)                                | done      |
| [3.16 Vacancy actions](3.16-vacancy-actions.md)                                            | done      |
| [3.17 Mark all as read on the Unread tab](3.17-mark-all-read-unread-tab.md)                | done      |
| [3.18 Mark all as read / unread for a company](3.18-mark-company-read-unread.md)           | done      |
| [3.19 Unread vacancy counter](3.19-unread-counter.md)                                      | done      |
| [3.20 E2E: from a URL to vacancies in Unread](3.20-e2e-url-to-unread.md)                   | done      |
| [3.21 Loading states and optimistic actions](3.21-loading-states-optimistic.md)            | done      |
| [3.22 Switching tabs during a row action](3.22-mark-then-switch-tab.md)                    | done      |
| [3.23 One database connection pool in production](3.23-one-db-pool.md)                     | done      |
| [3.24 Breezy HR parser](3.24-breezy-parser.md)                                             | done      |
| [3.25 CleverStaff parser](3.25-cleverstaff-parser.md)                                      | done      |
| [3.26 Hurma parser](3.26-hurma-parser.md)                                                  | done      |
| [3.27 Personio parser](3.27-personio-parser.md)                                            | done      |
| [3.28 softgarden parser](3.28-softgarden-parser.md)                                        | done      |
| [3.29 rexx parser](3.29-rexx-parser.md)                                                    | backlog   |
| [4.01 The check_runs + check_tasks schema](4.01-check-runs-tasks-schema.md)                | done      |
| [4.02 Claiming tasks and returning stuck ones](4.02-task-claiming-stale-recovery.md)       | done      |
| [4.03 The queue worker as a background loop](4.03-queue-background-loop.md)                | done      |
| [4.04 Check all for all Tracked](4.04-check-all-tracked.md)                                | done      |
| [4.05 Progress indicator in the header](4.05-header-progress.md)                           | done      |
| [4.06 Summary after a check finishes](4.06-check-summary.md)                               | done      |
| [4.07 Failed Sources Drawer with Retry](4.07-failed-sources-drawer.md)                     | done      |
| [4.08 Rules for overlapping runs](4.08-run-overlap-rules.md)                               | done      |
| [4.09 Company statuses on the Tracked tab](4.09-tracked-company-statuses.md)               | done      |
| [4.10 The History page with Load more](4.10-history-page.md)                               | done      |
| [4.11 E2E: Check all from start to summary](4.11-e2e-check-all.md)                         | done      |
| [4.12 Check status polling route](4.12-check-status-polling.md)                            | done      |
| [4.13 New vacancies notice on the Jobs page](4.13-new-vacancies-notice.md)                 | done      |
| [4.14 Attention colour in the Ink palette](4.14-highlight-color.md)                        | done      |
| [5.01 Platform detection by URL](5.01-platform-detection.md)                               | done      |
| [5.02 Search: links from the company site to an ATS](5.02-discovery-site-ats-links.md)     | done      |
| [5.03 Search: career pages on the company site](5.03-discovery-site-career-pages.md)       | done      |
| [5.04 Search: ATS by company name](5.04-discovery-ats-by-name.md)                          | done      |
| [5.05 Checking that a page belongs to the company](5.05-page-ownership-check.md)           | done      |
| [5.06 Trial read of findings](5.06-trial-read.md)                                          | done      |
| [5.07 Find pages in the Add company modal](5.07-find-pages-modal.md)                       | done      |
| [5.08 Duplicate marks in the findings list](5.08-discovery-duplicate-marks.md)             | done      |
| [5.09 First check right after Save](5.09-first-check-after-save.md)                        | done      |
| [5.10 Find new pages for the Not tracked list](5.10-find-new-pages-not-tracked.md)         | done      |
| [5.11 Not tracked tab statuses](5.11-not-tracked-statuses.md)                              | done      |
| [5.12 E2E: Find pages from a URL to vacancies](5.12-e2e-find-pages.md)                     | done      |
| [5.13 ATS on the company's domain](5.13-ats-on-company-domain.md)                          | done      |
| [5.14 Find pages for one company on Not tracked](5.14-find-pages-not-tracked-company.md)   | done      |
| [5.15 Known ATS without a parser](5.15-known-ats-without-parser.md)                        | done      |
| [6.01 The settings table and the Settings page](6.01-settings-page.md)                     | done      |
| [6.02 Computing the next auto-check time](6.02-next-auto-check-time.md)                    | done      |
| [6.03 Local auto-check and the check on start](6.03-auto-check-local.md)                   | done      |
| [6.04 AUTO_CHECK=off and shared limits through ENV](6.04-auto-check-env-limits.md)         | done      |
| [6.05 CSV Export with options](6.05-csv-export.md)                                         | done      |
| [6.06 CSV Import with a summary](6.06-csv-import.md)                                       | done      |
| [6.07 E2E: CSV there and back](6.07-e2e-csv-roundtrip.md)                                  | done      |
| [6.08 A separate working instance of the app](6.08-separate-work-instance.md)              | done      |
| [6.09 Backups of the working database](6.09-database-backups.md)                           | done      |
| [6.10 Autostart of the working instance](6.10-autostart-on-login.md)                       | done      |
| [6.11 Companies that need attention](6.11-companies-needing-attention.md)                  | done      |
| [6.12 Doubled name in the Add modal](6.12-add-dialog-doubled-name.md)                      | done      |
| [6.13 Check now during a general check](6.13-check-now-via-queue.md)                       | done      |
| [6.14 Checkbox in the dark theme](6.14-dark-theme-checkbox.md)                             | done      |
| [6.15 Links to findings in Find pages](6.15-found-pages-links.md)                          | done      |
| [6.16 A limit in vacancies, not pages](6.16-vacancy-limit-and-quick-checks.md)             | done      |
| [6.17 An own vacancy page as "link only"](6.17-reference-only-pages.md)                    | done      |
| [6.18 Mark all as unread on the Read tab](6.18-mark-all-unread-read-tab.md)                | done      |
| [6.19 Vacancy row highlight and summary auto-close](6.19-row-hover-and-summary-timeout.md) | done      |
| [6.20 Vacancy duplicates across a company's sources](6.20-cross-source-duplicates.md)      | done      |
| [6.21 An own career page by recipe](6.21-own-page-recipe.md)                               | done      |
| [6.22 DOU platform](6.22-dou-platform.md)                                                  | cancelled |
| [6.23 Djinni platform](6.23-djinni-platform.md)                                            | cancelled |
| [6.24 Jobico platform](6.24-jobico-platform.md)                                            | cancelled |
| [6.25 Workable parser](6.25-workable-parser.md)                                            | done      |
| [6.26 BambooHR parser](6.26-bamboohr-parser.md)                                            | done      |
| [6.27 Pinpoint parser](6.27-pinpoint-parser.md)                                            | done      |
| [6.28 TalentAdore parser](6.28-talentadore-parser.md)                                      | done      |
| [6.29 The page notices an auto-check](6.29-poll-idle-checks.md)                            | done      |
| [7.01 Neon: project and connection](7.01-neon-setup.md)                                    | backlog   |
| [7.02 API route for the schedule handler](7.02-schedule-handler-route.md)                  | backlog   |
| [7.03 Queue self-restart on Vercel](7.03-vercel-queue-restart.md)                          | backlog   |
| [7.04 Vercel Schedules once an hour](7.04-vercel-schedules.md)                             | backlog   |
| [7.05 Checking Vercel server limits](7.05-vercel-limits.md)                                | backlog   |
| [7.06 Moving data to Neon](7.06-neon-data-migration.md)                                    | backlog   |
| [7.07 Google sign-in with an allow-list](7.07-google-auth-allowlist.md)                    | backlog   |
| [7.08 First deploy to Vercel](7.08-first-vercel-deploy.md)                                 | backlog   |
| [7.09 Pinned GitHub Actions and Dependabot](7.09-pin-actions-dependabot.md)                | done      |
| [7.10 Load CSS only for the HeroUI components we use](7.10-heroui-css-subset.md)           | cancelled |
| [Sort out the npm audit vulnerabilities](npm-audit-vulnerabilities.md)                     | done      |
| [Split the documentation by app part](split-docs-by-app-part.md)                           | done      |
| [Check the documentation against the code](docs-sync-with-code.md)                         | done      |
| [A visible selected button in the Settings toggles](toggle-button-selected-contrast.md)    | done      |
| [The company card refreshes after Read as list](own-page-card-refresh.md)                  | done      |
| [UI audit](ui-audit.md)                                                                    | done      |
| [Theme: buttons, text, placeholders](ui-theme-basics.md)                                   | done      |
| [Phone and the card grid](ui-mobile-layout.md)                                             | done      |
| [The company card](ui-company-card.md)                                                     | done      |
| [Company dialogs](ui-company-dialogs.md)                                                   | done      |
| [The company site is required](company-site-required.md)                                   | done      |
| [Jobs, Settings, History](ui-small-screens.md)                                             | done      |
| [Change list off the card while the recipe works](change-list-placement.md)                | analyze   |
| [Counts in the Jobs tabs](jobs-tab-counts.md)                                              | done      |
| [Recent favorites on top in Favorites](favorites-added-today.md)                           | done      |
| [Undo after a vacancy action](vacancy-undo-toast.md)                                       | done      |
| [Accessibility audit](accessibility-audit.md)                                              | done      |
| [Prepare the repository for showing](public-repo-polish.md)                                | done      |
| [JD favicon](favicon-jd.md)                                                                | done      |
| [Company search on the Companies page](companies-search.md)                                | done      |
| [One orange in each theme](one-orange.md)                                                  | done      |
| [License and history check](public-license-history.md)                                     | done      |
| [Remove the docs/ plan](remove-docs-plan.md)                                               | done      |
| [CLAUDE.md and .claude/ in English](claude-md-english.md)                                  | done      |
| [Translate src/app](translate-app.md)                                                      | done      |
| [Translate src/server](translate-server.md)                                                | done      |
| [Translate src/lib, e2e and configs](translate-lib-e2e.md)                                 | done      |
| [Root README for an outside reader](public-readme.md)                                      | done      |
| [Flaky e2e/csv.spec.ts](csv-e2e-flake.md)                                                  | done      |
| [Vacancy row on a phone](vacancy-row-mobile.md)                                            | todo      |
