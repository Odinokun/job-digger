/**
 * Час бази для курсорів і меж: Jobs, History, Mark all as read.
 */
import { sql, type AnyColumn, type SQL } from "drizzle-orm";

/**
 * Момент часу точно так, як його зберігає база: ISO з мікросекундами. JS
 * `Date` тримає лише мілісекунди, тож межа, зібрана з нього, губила б
 * мікросекунди - рядок на межі опинявся б не з того боку.
 */
export function dbTimeText(time: SQL | AnyColumn): SQL<string> {
  return sql<string>`to_char(${time} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
}

/** Форма, яку дає `dbTimeText`: усе інше - не час бази. */
export const DB_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
