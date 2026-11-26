import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { DISCOVERY_STATUSES } from "../../lib/companies/company-list.ts";
import { CAREER_PLATFORMS } from "../../lib/companies/platform.ts";
import {
  AUTO_CHECK_INTERVALS,
  DEFAULT_AUTO_CHECK_INTERVAL,
} from "../../lib/settings/auto-check-interval.ts";
import type { CheckTaskError } from "../queue/task-error.ts";

/**
 * The only user of the local version. The value is technical: no mail is sent,
 * and Google sign-in arrives only in the online version with an allow-list in ENV.
 */
export const SYSTEM_USER_EMAIL = "system@job-digger.local";

/**
 * The data owner. Companies, sources, vacancies and settings are tied to a user,
 * so data stays isolated even in the local single-user version
 * (src/server/db/README.md).
 */
export const users = pgTable("users", {
  // A uuid, not a sequence: after the move online an id must not be guessable.
  id: uuid("id").primaryKey().defaultRandom(),
  // For the future Google sign-in. In the local version, a technical value.
  email: text("email").notNull().unique(),
  // timestamptz, not timestamp: it stores a moment in time, not zoneless "wall clock" time.
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Company states on the Not tracked tab. The other statuses of the company list
 * are not stored here: Tracked means "at least one source is tracked", and
 * OK / Has errors / Checking are computed from the sources and the queue.
 *
 * The list itself is in [`lib/companies/company-list.ts`](../../lib/companies/company-list.ts),
 * because the status type is also needed in the client company list.
 */
export const discoveryStatus = pgEnum("discovery_status", DISCOVERY_STATUSES);

/**
 * The platform of a career source: it selects the parser. The list itself is in
 * [`lib/companies/platform.ts`](../../lib/companies/platform.ts), because the
 * client needs it too.
 */
export const careerPlatform = pgEnum("career_platform", CAREER_PLATFORMS);

/**
 * A company whose vacancies the user follows.
 */
export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // The main address as the user entered it: with the path, because
    // bosch.com/de and bosch.com/ua are different companies (src/lib/companies/README.md).
    //
    // Required (the author's decision of 21.11.2026, task company-site-required):
    // before that a company found only on an ATS could live without a site (card
    // 2.17), but without one the search for pages on the site does not work and
    // duplicates are caught only by sources.
    url: text("url").notNull(),
    // The same address in normalized form - only for comparing duplicates.
    // The normalization itself and the match message are task 2.02.
    normalizedUrl: text("normalized_url").notNull(),
    discoveryStatus: discoveryStatus("discovery_status")
      .notNull()
      .default("not_checked"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The same company only once per user. Different users may have the same
    // companies: data is isolated.
    uniqueIndex("companies_user_normalized_url_unique").on(
      table.userId,
      table.normalizedUrl,
    ),
    // The company list is always read for one user and sorted by name.
    // PostgreSQL does not index a foreign key automatically.
    index("companies_user_name_idx").on(table.userId, table.name),
    // NOT NULL does not catch an empty string, and an empty name would give a blank row in the list.
    check("companies_name_not_blank", sql`length(trim(${table.name})) > 0`),
  ],
);

/**
 * A company's career source: one source = one check task.
 * One company has many sources (src/server/db/README.md).
 */
export const careerSources = pgTable(
  "career_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    // The same address in normalized form. Needed to find the same source in
    // **another** company with a query: normalization lives in TypeScript
    // (`normalizeCompanyUrl`) and cannot be written as an SQL expression, so the
    // result has to be stored. For a company without a site this is the only
    // thing that tells it from an identical one (card 2.17).
    normalizedUrl: text("normalized_url").notNull(),
    // A label the user tells sources of one site apart by: three mozilla.org
    // filters differ only in `query`, and the raw URL does not tell them apart
    // (card 2.16). Optional: a source with its own domain needs no label.
    label: text("label"),
    platform: careerPlatform("platform").notNull(),
    // An address nothing can read is stored without tracking: it will be useful
    // if new ways of reading appear.
    isTracked: boolean("is_tracked").notNull().default(true),
    // The person marked a page nothing can read as "link only" (task 6.17): it
    // stays on the card but does not count as unread in Needs attention or in the
    // "N pages not read" badge. Only for `unsupported` - the action that sets the
    // mark checks this.
    isReferenceOnly: boolean("is_reference_only").notNull().default(false),
    // The own page recipe (platform `own_page`, task 6.21): vacancies are links
    // whose address is this prefix (the host and the path up to the last `/`) plus
    // one more segment. For example `kinggroup.io/vacancies/design/`. For other
    // platforms, `null`.
    vacancyLinkPrefix: text("vacancy_link_prefix"),
    // How many checks in a row ended in an error. Vacancies are not deleted after
    // a failure, so without this counter stale data cannot be told from fresh.
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    // The time of the last successful check: showing "Last ok: 12 days ago" is task 4.09.
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    // The last successful full read - every page up to the limit, or a list that
    // ended by itself. The auto-check reads in full at most once a day, otherwise
    // only the first page (task 6.16). `null` means never read in full yet.
    lastFullReadAt: timestamp("last_full_read_at", { withTimezone: true }),
    // The time of the last check, successful or not: "Last checked: 5 min ago" on
    // the company card. `null` means not checked yet.
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("career_sources_company_idx").on(table.companyId)],
);

/**
 * A vacancy of a career source (src/server/vacancies/README.md).
 * The company and the source address come through the "vacancy → source →
 * company" link and are not stored separately; neither are the description,
 * salary or employment type.
 */
export const vacancies = pgTable(
  "vacancies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Deleting a source or a company takes its vacancies too, Favorites included:
    // the same rule as for Delete company.
    sourceId: uuid("source_id")
      .notNull()
      .references(() => careerSources.id, { onDelete: "cascade" }),
    // An internal key within the source: `id:<platform ID>` or, without an ID,
    // `url:<normalized address>`. Task 3.05 builds the string.
    key: text("key").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    // Optional: if the source did not give it, the list shows "—".
    location: text("location"),
    // The detection date: the Jobs list is sorted by it. It is the start of the
    // check that found the vacancy (`checkedAt`), not the moment the row was written.
    firstDetectedAt: timestamp("first_detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // The moment the row was written - the database clock, not the check's. The
    // boundary for "Mark all as read": a check running while the dialog is open
    // writes vacancies with an earlier `first_detected_at`, but their `created_at`
    // is later than the boundary (src/server/vacancies/README.md, "Concurrent changes").
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // When a check last saw the vacancy.
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    isRead: boolean("is_read").notNull().default(false),
    isFavorite: boolean("is_favorite").notNull().default(false),
    // When the vacancy was added to Favorites: the tab is sorted by it, newest on
    // top, and shows an "added today" group. Removing the star clears it.
    // Favorites added before the column existed have `null`: such vacancies are
    // ordered by detection date (src/server/vacancies/README.md, "Jobs lists").
    favoritedAt: timestamp("favorited_at", { withTimezone: true }),
    // The Closed mark: a vacancy in Favorites disappeared from the site. A moment,
    // not a yes/no, so it is visible when it closed.
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    // Within one source we create no repeated records - the database enforces it.
    // Duplicates across sources are allowed.
    uniqueIndex("vacancies_source_key_idx").on(table.sourceId, table.key),
    // The Jobs list: sorting and the cursor by detection date and id.
    index("vacancies_detected_idx").on(table.firstDetectedAt, table.id),
    // Only a favorite vacancy has an added date.
    check(
      "vacancies_favorited_at_only_for_favorites",
      sql`${table.favoritedAt} is null or ${table.isFavorite}`,
    ),
  ],
);

/**
 * A general check (Check all or an auto-check) - one History row. Check now and
 * Retry are not written here.
 *
 * The counters are stored rather than computed from `check_tasks`: a History row
 * records the result at the moment it finished, and the tasks of a deleted
 * source go with it (src/server/checks/README.md).
 */
export const checkRuns = pgTable(
  "check_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Date & time in History and the start of Duration.
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // `null` means the run is still going.
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    // How many sources the run has: the denominator of the "Checking 37/120" progress.
    sourcesTotal: integer("sources_total").notNull().default(0),
    // How many sources were checked, failed ones included. The progress numerator
    // and Sources checked in History.
    sourcesChecked: integer("sources_checked").notNull().default(0),
    sourcesFailed: integer("sources_failed").notNull().default(0),
    newVacancies: integer("new_vacancies").notNull().default(0),
    removedVacancies: integer("removed_vacancies").notNull().default(0),
    // When the summary was shown to the user. A run often finishes with the tab
    // closed, and the summary has to pop up once on return (4.06).
    summaryShownAt: timestamp("summary_shown_at", { withTimezone: true }),
  },
  (table) => [
    // One general check at a time per user: even if two simultaneous Check all
    // both pass the check in code, the database lets only one through.
    uniqueIndex("check_runs_one_active_per_user")
      .on(table.userId)
      .where(sql`${table.finishedAt} is null`),
    // History: the user's runs, newest first.
    index("check_runs_user_started_idx").on(table.userId, table.startedAt),
  ],
);

/**
 * Task priority. The order of the values is the claim order: manual actions
 * whose result the user is watching (Check now, Retry) are taken from the queue
 * before background ones (src/server/queue/README.md).
 */
export const checkTaskPriority = pgEnum("check_task_priority", [
  "manual",
  "background",
]);

/**
 * What a task does: `check` checks one career source, `discover` looks for the
 * career pages of a company on the Not tracked tab (Find new pages, task 5.10).
 * One queue for both: the shared limit on concurrent tasks, claiming and the
 * return of stuck tasks work the same way.
 */
export const checkTaskKind = pgEnum("check_task_kind", ["check", "discover"]);

/**
 * How much a check task reads: only the first page or up to the limit
 * (`src/server/parsers/vacancies-to-check.ts`, task 6.16). Stored in the task so
 * that Retry repeats exactly what failed.
 */
export const checkTaskReadDepth = pgEnum("check_task_read_depth", [
  "first-page",
  "full",
]);

export const checkTaskStatus = pgEnum("check_task_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
]);

/**
 * A queue task: the check of one career source. One source = one task
 * (CLAUDE.md, "Architecture").
 */
export const checkTasks = pgTable(
  "check_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: checkTaskKind("kind").notNull().default("check"),
    // Deleting a source takes its tasks: unfinished ones are simply cancelled,
    // and the lifecycle discards the result of one already claimed (3.13). Only in
    // `check`: `discover` has no source yet.
    sourceId: uuid("source_id").references(() => careerSources.id, {
      onDelete: "cascade",
    }),
    // The company whose pages are searched for - only in `discover`. A deleted
    // company takes its search with it.
    companyId: uuid("company_id").references(() => companies.id, {
      onDelete: "cascade",
    }),
    // The general check that created the task. `null` means Check now or Retry:
    // they are not written to History.
    runId: uuid("run_id").references(() => checkRuns.id, {
      onDelete: "cascade",
    }),
    priority: checkTaskPriority("priority").notNull().default("background"),
    // Not used in `discover`. Defaults to `full` - that is how every task read
    // before 6.16.
    readDepth: checkTaskReadDepth("read_depth").notNull().default("full"),
    status: checkTaskStatus("status").notNull().default("queued"),
    // How many times the task was claimed: limits retries after a failure.
    attempts: integer("attempts").notNull().default(0),
    // When a worker claimed the task. By it, a task stuck in `running` goes back
    // to the queue (4.02).
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    // The parser error as it returned it, or a reason from the queue itself
    // (`queue/task-error.ts`): the Failed Sources Drawer shows it. A technical
    // detail - History does not show it.
    error: jsonb("error").$type<CheckTaskError>(),
    // Parse warning: how many records the parser skipped because of bad data
    // (src/server/parsers/README.md).
    skippedVacancies: integer("skipped_vacancies").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Claiming: the queue by priority and age. Partial, because the queue always
    // holds a handful of rows, while finished ones pile up in the thousands.
    index("check_tasks_queue_idx")
      .on(table.priority, table.createdAt)
      .where(sql`${table.status} = 'queued'`),
    // Finishing a run and its progress are counted over the run's tasks.
    index("check_tasks_run_idx").on(table.runId),
    // The Failed Sources Drawer and the cascade deletion of a source.
    index("check_tasks_source_idx").on(table.sourceId),
    // The cascade deletion of a company and "is Find new pages running".
    index("check_tasks_company_idx").on(table.companyId),
    // Each kind of task has exactly its own target: a check has a source, a search
    // a company. Otherwise a worker would get a task it has nothing to run on.
    check(
      "check_tasks_target_matches_kind",
      sql`(${table.kind} = 'check' and ${table.sourceId} is not null and ${table.companyId} is null) or (${table.kind} = 'discover' and ${table.companyId} is not null and ${table.sourceId} is null)`,
    ),
  ],
);

/**
 * The user's personal settings (src/server/db/README.md; task 6.01).
 *
 * One row per user, and it appears only with the first choice: until then the
 * defaults apply (`server/settings`). Theme and language are not here - they
 * are in cookies (`lib/theme.ts`, `i18n/config.ts`).
 */
export const settings = pgTable(
  "settings",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    // The auto-check interval in hours - a number, not an enum: the next check
    // time is computed from it (6.02).
    autoCheckIntervalHours: integer("auto_check_interval_hours")
      .notNull()
      .default(DEFAULT_AUTO_CHECK_INTERVAL),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The same list Settings shows: the database refuses any other value, even if
    // a write goes around our code.
    check(
      "settings_auto_check_interval_allowed",
      sql`${table.autoCheckIntervalHours} in (${sql.raw(AUTO_CHECK_INTERVALS.join(", "))})`,
    ),
  ],
);
