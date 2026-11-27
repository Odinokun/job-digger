/**
 * A row of the Failed Sources Drawer (src/server/checks/README.md). The type is
 * shared: the server returns it (`server/checks/failed-sources.ts`), and the client
 * shows it.
 */

/** The failure reason - from `check_tasks.error`, without technical details. */
export type FailureReason =
  | "not-found"
  | "unreadable"
  | "bad-status"
  | "fetch-failed"
  | "stalled"
  | "abandoned"
  | "crashed";

export interface FailedSource {
  sourceId: string;
  companyName: string;
  url: string;
  /** The source label, if the user gave one. */
  label: string | null;
  reason: FailureReason;
  /** The site's response code - only for `bad-status`. */
  httpStatus: number | null;
  /** A Retry is queued and has not finished yet. */
  isRetrying: boolean;
}

export interface FailedSourcesList {
  items: FailedSource[];
  /** Retry is available only after the general check has finished. */
  canRetry: boolean;
}
