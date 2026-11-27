/**
 * A company's status on the Tracked tab: OK - the last check had no errors, Has
 * errors - there are failed sources, Checking - being checked right now.
 */
import type { CompanySource } from "./company-list";

export type CompanyCheckStatus = "ok" | "has-errors" | "checking";

export interface CompanyCheckStatusContext {
  /**
   * The user's general check is running - it takes all Tracked companies, so each of
   * them is being checked right now.
   */
  isGeneralCheckRunning: boolean;
}

/**
 * The status from tracked sources: an untracked page is not checked, and its old
 * failure is not news. `null` means none has been checked yet, there is nothing to
 * show.
 */
export function companyCheckStatus(
  sources: CompanySource[],
  { isGeneralCheckRunning }: CompanyCheckStatusContext,
): CompanyCheckStatus | null {
  const tracked = sources.filter((source) => source.isTracked);

  if (tracked.length === 0) return null;
  if (isGeneralCheckRunning || tracked.some((source) => source.isChecking)) {
    return "checking";
  }
  if (tracked.some((source) => source.lastCheck === "failed")) {
    return "has-errors";
  }
  if (tracked.some((source) => source.lastCheck === "ok")) return "ok";

  return null;
}

/** What a Tracked card shows on the left of its footer: one coloured badge and maybe text. */
export interface CardStatusBadge {
  badge: CompanyCheckStatus | "not-read" | null;
  /** "N pages not read" as muted text next to it, because the badge is already taken. */
  notReadAsText: boolean;
}

/**
 * One coloured badge per card (UI audit, A6): four coloured marks side by side -
 * Checking, Has errors, "2 pages not read" - blurred into noise.
 *
 * The badge goes to what matters most: a running check and errors - they need
 * action now; then unread pages; OK only when there is nothing else. Unread pages
 * next to Checking or Has errors stay as text.
 */
export function cardStatusBadge(
  status: CompanyCheckStatus | null,
  notReadCount: number,
): CardStatusBadge {
  if (status === "checking" || status === "has-errors") {
    return { badge: status, notReadAsText: notReadCount > 0 };
  }

  if (notReadCount > 0) {
    return { badge: "not-read", notReadAsText: false };
  }

  return { badge: status, notReadAsText: false };
}
