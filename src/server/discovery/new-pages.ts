/**
 * The Find new pages decision for one Not tracked company (task 5.10): which
 * findings to add as sources without a human, and which status to set if there
 * is still nothing to track.
 */
import type { DiscoveryStatus } from "../../lib/companies/company-list.ts";
import { isReliableFinding, type Finding } from "./discover.ts";

export interface NewPagesInput {
  findings: Finding[];
  /** The company site did not answer: nothing is known about its pages. */
  siteFailed: boolean;
  /** Finding addresses that another of the user's companies already tracks. */
  taken: ReadonlySet<string>;
  /**
   * Finding addresses that are already sources of the company itself: they
   * affect the status (an own page saved last time is still Unsupported) but are
   * not added a second time.
   */
  owned: ReadonlySet<string>;
}

export interface NewPagesDecision {
  /** Addresses that become the company's sources. */
  add: string[];
  /**
   * The new `discovery_status`, or `null`: a company with an added board moves to
   * Tracked, and the Not tracked tab status no longer concerns it.
   */
  status: DiscoveryStatus | null;
}

/**
 * Only reliable findings (`isReliableFinding`) that can be read are added without
 * a human, plus own pages from the company site: nothing can read them yet, but
 * the address is kept for when a parser appears. A finding another company
 * already tracks is never added: Save would refuse it with `source-taken` anyway
 * (task 5.08).
 *
 * The status when no board was added, from the most useful for a person:
 * `possible_page` (there is something to confirm through Find pages),
 * `check_failed` (the site or a board did not answer - worth retrying),
 * `unsupported` (there is only an own page), `not_found`.
 */
export function decideNewPages({
  findings,
  siteFailed,
  taken,
  owned,
}: NewPagesInput): NewPagesDecision {
  const free = findings.filter((finding) => !taken.has(finding.url));
  const reliable = free.filter(isReliableFinding);
  const boards = reliable.filter((finding) => finding.trial.kind === "read");
  const ownPages = reliable.filter(
    (finding) => finding.trial.kind === "unsupported",
  );
  const add = [...boards, ...ownPages]
    .map((finding) => finding.url)
    .filter((url) => !owned.has(url));

  if (boards.length > 0) {
    return { add, status: null };
  }

  if (free.some((finding) => finding.trial.kind === "read")) {
    return { add, status: "possible_page" };
  }

  if (siteFailed || free.some((finding) => finding.trial.kind === "failed")) {
    return { add, status: "check_failed" };
  }

  return { add, status: ownPages.length > 0 ? "unsupported" : "not_found" };
}
