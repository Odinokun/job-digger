/**
 * The shared format of all parsers: what they return.
 *
 * A parser only reads what is on the platform right now. The detection date,
 * Read/Unread, the vacancy key and URL cleanup are the lifecycle's job (tasks
 * 3.13 and 3.05).
 */
import type { HttpErrorReason } from "../http/client.ts";

/** A vacancy as the source gave it. */
export interface ParsedVacancy {
  /**
   * The ID on the platform - the vacancy key is built from it. `null` if the
   * platform does not give one (schema.org, task 3.11): then the key is built
   * from the address.
   */
  externalId: string | null;
  title: string;
  /** The link to the original; always http or https. */
  url: string;
  /** There may be no location - then the Jobs list shows "—". */
  location: string | null;
}

export type ParserError =
  /** The page or board does not exist: the site answered 404. */
  | { reason: "not-found" }
  /**
   * A response of the wrong format: a broken structure in even one record, or
   * bad data in every record (README, "Shared format").
   */
  | { reason: "unreadable" }
  /** The site answered neither 2xx nor 404 (for example 403 or 500 after retries). */
  | { reason: "bad-status"; status: number }
  /** The request failed: the reason comes from `HttpError`. */
  | { reason: "fetch-failed"; cause: HttpErrorReason };

export type ParseResult =
  | {
      ok: true;
      vacancies: ParsedVacancy[];
      /**
       * How many records were skipped because of bad data - an empty title or a
       * non-http(s) address (src/server/parsers/README.md). A "look at the parser
       * or the site" signal - a parse warning in the task details (4.01).
       */
      skipped: number;
      /**
       * `true` means reading stopped at the limit (`vacancies-to-check.ts`), and
       * there may be more vacancies beyond it. Then the list is incomplete, and the
       * lifecycle marks nothing as gone (task 6.16). No field means the list is
       * complete: always the case for parsers that take everything in one request.
       */
      truncated?: true;
    }
  | { ok: false; error: ParserError };
