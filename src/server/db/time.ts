/**
 * Database time for cursors and boundaries: Jobs, History, Mark all as read.
 */
import { sql, type AnyColumn, type SQL } from "drizzle-orm";

/**
 * A moment in time exactly as the database stores it: ISO with microseconds. A
 * JS `Date` keeps only milliseconds, so a boundary built from one would lose the
 * microseconds - a row on the boundary would end up on the wrong side.
 */
export function dbTimeText(time: SQL | AnyColumn): SQL<string> {
  return sql<string>`to_char(${time} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
}

/** The form `dbTimeText` gives: anything else is not database time. */
export const DB_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
