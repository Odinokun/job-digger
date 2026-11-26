/**
 * The vacancy lifecycle: what one check of a source does to its vacancies in the
 * database. The rules and decisions are in the README.md next to this file,
 * section "Lifecycle".
 */
import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { CareerPlatform } from "../../lib/companies/platform.ts";
import { careerSources, companies, vacancies } from "../db/schema.ts";
import type { ParsedVacancy, ParseResult } from "../parsers/types.ts";
import { resolveDuplicates, sourceKind } from "./duplicates.ts";
import { vacancyKey } from "./key.ts";

export interface SyncSourceVacanciesInput {
  sourceId: string;
  /** The parser's response for this source. */
  result: ParseResult;
  /**
   * The check moment. Passed in from outside rather than taken from a clock here:
   * the queue sets it, and a test can compare dates for equality.
   */
  checkedAt: Date;
}

/**
 * What the check did to the source's vacancies - the numbers of the History row.
 * Removed ones are all that disappeared from the site: both the erased ones and
 * the Favorites that got Closed.
 */
export interface SyncCounts {
  newVacancies: number;
  removedVacancies: number;
}

const NOTHING: SyncCounts = { newVacancies: 0, removedVacancies: 0 };

export async function syncSourceVacancies(
  db: NodePgDatabase,
  { sourceId, result, checkedAt }: SyncSourceVacanciesInput,
): Promise<SyncCounts> {
  if (!result.ok) return NOTHING;

  return db.transaction(async (tx) => {
    // The source may have been deleted while the site was answering - then the
    // result is discarded (the README.md next to this file). `FOR KEY SHARE` also
    // keeps the source from being deleted until the end of the transaction: the
    // deletion waits, and the cascade removes the vacancies just written together
    // with the old ones
    // (https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS).
    const [source] = await tx
      .select({
        id: careerSources.id,
        companyId: careerSources.companyId,
        platform: careerSources.platform,
      })
      .from(careerSources)
      .where(eq(careerSources.id, sourceId))
      .for("key share");
    if (source === undefined) return NOTHING;

    // The sources of one company are checked in parallel, and a duplicate is looked
    // for among the vacancies of its other sources (task 6.20). Without ordering,
    // two sources at the same time would not see each other and would both write
    // the vacancy as unread. `FOR NO KEY UPDATE` conflicts with itself, so the
    // writes of one company go one after another, but not with `FOR KEY SHARE`,
    // which source inserts use to check the foreign key - adding a source does not
    // wait (https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS).
    await tx
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, source.companyId))
      .for("no key update");

    const newIds = await upsertSeen(tx, sourceId, result.vacancies, checkedAt);
    const duplicates = await markDuplicates(tx, {
      sourceId,
      companyId: source.companyId,
      platform: source.platform,
      newIds,
    });

    return {
      // A duplicate is written as read - it is not new to the user.
      newVacancies: newIds.length - duplicates,
      // A cut-off list (the limit or the first page) does not say the rest
      // disappeared: it was just not read (task 6.16).
      removedVacancies: result.truncated
        ? 0
        : await removeGone(tx, sourceId, checkedAt),
    };
  });
}

type Executor = Pick<NodePgDatabase, "insert" | "execute">;

/**
 * The found vacancies: new ones are created, existing ones get fresh data from the
 * site. Returns the ids of the new vacancies.
 */
async function upsertSeen(
  db: Executor,
  sourceId: string,
  list: ParsedVacancy[],
  checkedAt: Date,
): Promise<string[]> {
  // Drizzle does not accept an empty `values([])`, and there is nothing to insert anyway.
  if (list.length === 0) return [];

  const rows = await db
    .insert(vacancies)
    .values(
      uniqueByKey(list).map(([key, vacancy]) => ({
        sourceId,
        key,
        title: vacancy.title,
        url: vacancy.url,
        location: vacancy.location,
        firstDetectedAt: checkedAt,
        lastSeenAt: checkedAt,
      })),
    )
    // The vacancy already exists - only the check's fields are updated. Read and
    // Favorite belong to the user and do not get here (README, "Concurrent changes").
    .onConflictDoUpdate({
      target: [vacancies.sourceId, vacancies.key],
      set: {
        // `excluded` is the row we tried to insert
        // (https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT).
        // A new address is possible here only for a key with an ID: without an ID
        // another address gives another key, that is another vacancy (`key.ts`).
        title: sql.raw(`excluded.${vacancies.title.name}`),
        url: sql.raw(`excluded.${vacancies.url.name}`),
        location: sql.raw(`excluded.${vacancies.location.name}`),
        lastSeenAt: checkedAt,
        // A closed vacancy in Favorites came back to the site - the Closed mark is
        // removed, while Read, Favorite and the discovery date stay: the user has
        // already seen it and saved it. The rule "came back - a new Unread" is
        // about deleted vacancies, and for them it happens by itself - the row is
        // created again.
        closedAt: null,
      },
    })
    .returning({
      id: vacancies.id,
      firstDetectedAt: vacancies.firstDetectedAt,
    });

  // A new one is one discovered by exactly this check: updating an existing one
  // does not touch the discovery date.
  return rows
    .filter((row) => row.firstDetectedAt.getTime() === checkedAt.getTime())
    .map((row) => row.id);
}

/**
 * The title for comparing duplicates: lower case, spaces trimmed at the edges and
 * collapsed to one inside. PostgreSQL's `lower` knows Cyrillic too: the database
 * is created with `en_US.utf8`
 * (https://www.postgresql.org/docs/current/functions-string.html).
 */
function comparableTitle(column: string) {
  return sql.raw(`lower(btrim(regexp_replace(${column}, '\\s+', ' ', 'g')))`);
}

/**
 * Duplicates of freshly discovered vacancies among the active vacancies of the
 * same company's other sources (task 6.20). `resolveDuplicates` decides which
 * become read; returns how many new vacancies were marked read.
 *
 * Only freshly discovered ones: a vacancy the user put back into Unread is not
 * touched by the next check. A closed vacancy in Favorites does not count as a
 * duplicate - it is no longer on the site.
 */
async function markDuplicates(
  db: Executor,
  {
    sourceId,
    companyId,
    platform,
    newIds,
  }: {
    sourceId: string;
    companyId: string;
    platform: CareerPlatform;
    newIds: string[];
  },
): Promise<number> {
  if (newIds.length === 0) return 0;

  const ids = sql.join(
    newIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const { rows } = await db.execute<{
    newId: string;
    otherId: string;
    otherPlatform: CareerPlatform;
    otherIsRead: boolean;
  }>(sql`
    select found.id as "newId",
           other.id as "otherId",
           other_source.platform as "otherPlatform",
           other.is_read as "otherIsRead"
    from ${vacancies} as found
    join ${vacancies} as other
      on other.source_id <> found.source_id
     and other.closed_at is null
     and ${comparableTitle("other.title")} = ${comparableTitle("found.title")}
    join ${careerSources} as other_source
      on other_source.id = other.source_id
     and other_source.company_id = ${companyId}
    where found.source_id = ${sourceId} and found.id in (${ids})
  `);

  const decision = resolveDuplicates(
    sourceKind(platform),
    rows.map((row) => ({
      newId: row.newId,
      otherId: row.otherId,
      otherKind: sourceKind(row.otherPlatform),
      otherIsRead: row.otherIsRead,
    })),
  );

  const toRead = [...decision.readNew, ...decision.readOthers];
  if (toRead.length > 0) {
    await db.execute(sql`
      update ${vacancies} set is_read = true
      where id in (${sql.join(
        toRead.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
    `);
  }

  return decision.readNew.length;
}

/**
 * Vacancies with distinct keys, the first one for each key. We do not create
 * repeats within a source, and `ON CONFLICT DO UPDATE` does not let one command
 * change one row twice either - it fails with a cardinality violation
 * (https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT).
 */
function uniqueByKey(list: ParsedVacancy[]): [string, ParsedVacancy][] {
  const byKey = new Map<string, ParsedVacancy>();

  for (const vacancy of list) {
    const key = vacancyKey(vacancy);
    if (!byKey.has(key)) byKey.set(key, vacancy);
  }

  return [...byKey];
}

/**
 * Gone vacancies are those this check did not see: after `upsertSeen` their
 * `last_seen_at` is earlier than `checkedAt`. Ordinary ones are deleted, those in
 * Favorites get the Closed mark.
 *
 * One command, not "read, then delete" (README, "Concurrent changes"): the `NOT
 * is_favorite` condition is checked at the moment of deletion. If the user is
 * adding the vacancy to Favorites right then, PostgreSQL waits for their
 * transaction and checks the condition on the updated row, so the vacancy is not
 * lost (https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED).
 *
 * Both parts of the command see one database snapshot
 * (https://www.postgresql.org/docs/current/queries-with.html#QUERIES-WITH-MODIFYING),
 * so such a vacancy does not even get Closed in this check - only in the next one.
 * What matters is that it stays.
 */
async function removeGone(
  db: Executor,
  sourceId: string,
  checkedAt: Date,
): Promise<number> {
  const gone = sql`${vacancies.sourceId} = ${sourceId} and ${vacancies.lastSeenAt} < ${checkedAt}`;

  const result = await db.execute<{ removed: number }>(sql`
    with deleted as (
      delete from ${vacancies}
      where ${gone} and not ${vacancies.isFavorite}
      -- A closed vacancy taken out of Favorites is deleted but not counted
      -- again: it was already counted as gone when it closed.
      returning ${vacancies.closedAt} is null as counted
    ),
    closed as (
      update ${vacancies}
      set ${sql.identifier(vacancies.closedAt.name)} = ${checkedAt}
      where ${gone} and ${vacancies.isFavorite} and ${vacancies.closedAt} is null
      returning 1
    )
    select ((select count(*) from deleted where counted) + (select count(*) from closed))::int as removed
  `);

  return result.rows[0].removed;
}
