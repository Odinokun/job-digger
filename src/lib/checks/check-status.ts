/**
 * The general check state the UI gets by polling (src/server/checks/README.md).
 * The type is shared: the server returns it (`server/checks/check-status.ts`) and
 * the client reads it.
 */

/** The progress of an active run - the numbers for "Checking 37/120". */
export interface RunProgress {
  /** How many sources the run has. */
  total: number;
  /** How many were checked, failed ones included. */
  checked: number;
  failed: number;
  newVacancies: number;
  removedVacancies: number;
}

/**
 * The summary of a finished run that has not been shown yet
 * (src/server/checks/README.md). Successful ones are `checked - failed`.
 */
export interface RunSummary {
  runId: string;
  checked: number;
  failed: number;
  newVacancies: number;
  removedVacancies: number;
}

export interface CheckStatus {
  /** The user's active run, or `null` if no check is running. */
  run: RunProgress | null;
  /** The last finished run with a summary not shown yet. */
  summary: RunSummary | null;
  /** The number of unread vacancies - the counter in the menu and the tab title. */
  unread: number;
  /**
   * Find new pages is running (task 5.10): it has no run, hence a separate flag.
   * While it is `true`, the UI polls the state.
   */
  findingNewPages: boolean;
}

/**
 * A History row: exactly five figures of a finished general check.
 */
export interface CheckRunRow {
  id: string;
  /** Date & time - when the run started. */
  startedAt: Date;
  /** How many sources were checked, failed ones included. */
  sourcesChecked: number;
  newVacancies: number;
  removedVacancies: number;
  durationMs: number;
}
