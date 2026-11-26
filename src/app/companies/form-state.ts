import type { CheckStatus } from "@/lib/checks/check-status";
import type { CompanyListItem } from "@/lib/companies/company-list";
import type { Cursor } from "@/lib/pagination/cursor";
import type { AddCompanyResult } from "@/server/companies/add";
import type { DeleteCompanyResult } from "@/server/companies/delete";
import type { AddCareerSourceResult } from "@/server/companies/sources";
import type { UpdateCompanyResult } from "@/server/companies/update";
import type { CompanyWithSource } from "@/server/companies/source-duplicates";
import type { Finding } from "@/server/discovery/discover";
import type { UrlRefusalReason } from "@/lib/companies/url";

/**
 * The form states of the Companies page and their initial values.
 *
 * Kept apart from `actions.ts` because that file starts with `"use server"`, and
 * such a file may export **only async functions**: any other export is the
 * error "A "use server" file can only export async functions, found object"
 * (https://nextjs.org/docs/messages/invalid-use-server-value). Types are erased
 * at build time and pass, but an initial-state constant does not.
 *
 * The client modals import this file too. `AddCompanyResult` comes here from
 * `src/server`, but only as a type: `import type` is erased, so server code does
 * not reach the client bundle.
 */

/**
 * The Add company form state between submissions.
 *
 * Success returns only the fact, not the company row: whatever an action returns
 * is serialized and sent to the client, so we return what the UI needs, not a
 * database record (Next docs, "Constrain return values").
 */
export type AddCompanyFormState =
  | { status: "idle" }
  /**
   * Added. `company` is the row for the current tab, or `null` if the company
   * landed in another one: without a career page it goes to Not tracked.
   *
   * The row is returned so the list can insert it without re-reading the loaded
   * batches.
   */
  | {
      status: "added";
      company: CompanyListItem | null;
      /**
       * The company to check right away, or `null` if it has no tracked
       * sources - then it is in Not tracked (task 5.09).
       */
      firstCheck: string | null;
    }
  | { status: "failed"; result: Extract<AddCompanyResult, { ok: false }> }
  /**
   * A failure the form did not foresee: the database is down, a query failed.
   *
   * Separate from `failed`: there the reason belongs to a form field and the user
   * can fix it, here there is nothing to fix - only to try again.
   */
  | { status: "failed-unexpectedly" };

/**
 * A finding in the Find pages list, together with whether another company of
 * the user already has this source (task 5.08). The search itself does not know
 * the database, so the action adds this.
 */
export type FoundPage = Finding & { trackedIn: CompanyWithSource | null };

/**
 * The Find pages response: findings, or why the search did not start.
 *
 * `address-required` - both the site and the name are empty: nothing to search by.
 */
export type FindPagesResult =
  | { ok: true; findings: FoundPage[] }
  | { ok: false; problem: "address-required" }
  | { ok: false; problem: "company-url"; reason: UrlRefusalReason }
  | { ok: false; problem: "failed-unexpectedly" };

export const ADD_COMPANY_INITIAL_STATE: AddCompanyFormState = {
  status: "idle",
};

/**
 * The Edit modal state between submissions.
 *
 * `not-found` arrives here if the company was deleted in another tab while the
 * modal was open.
 *
 * The refusal arrives whole, as in Add company: `source-url` also carries the
 * reason the address was refused, and a narrowed `problem` would lose it.
 */
export type EditCompanyFormState =
  | { status: "idle" }
  /**
   * Saved. `company` is the same row the list now shows, or `null` if the
   * company no longer belongs to the tab: without career pages it moves to Not
   * tracked.
   *
   * The row is returned so the list replaces exactly that row and does not
   * re-read the loaded batches.
   */
  | { status: "saved"; company: CompanyListItem | null }
  | { status: "failed"; result: Extract<UpdateCompanyResult, { ok: false }> }
  | { status: "failed-unexpectedly" };

export const EDIT_COMPANY_INITIAL_STATE: EditCompanyFormState = {
  status: "idle",
};

/**
 * The state of the delete confirmation dialog.
 *
 * Success returns nothing but the fact: the company row is gone, and the list
 * already knows its id - that is the row it removes.
 *
 * `not-found` arrives here if the company was deleted in another tab while the
 * dialog was open. For the list the result is the same - the company is gone -
 * so the row is removed here too, only the text differs.
 */
export type DeleteCompanyFormState =
  | { status: "idle" }
  | { status: "deleted" }
  | { status: "failed"; result: Extract<DeleteCompanyResult, { ok: false }> }
  | { status: "failed-unexpectedly" };

export const DELETE_COMPANY_INITIAL_STATE: DeleteCompanyFormState = {
  status: "idle",
};

/**
 * How the offer "add this address as a career page of the company found" in
 * the Add company modal ended.
 *
 * `company` is the row of the company that got the source, or `null` if it does
 * not belong to this tab: the list replaces exactly that row.
 */
export type AddCareerSourceFormState =
  /**
   * `companyId` is needed apart from the row: when the company does not belong
   * to this tab, `company` comes as `null`, and it is exactly its row that has to
   * be removed from the list.
   */
  | { status: "added"; companyId: string; company: CompanyListItem | null }
  | { status: "failed"; result: Extract<AddCareerSourceResult, { ok: false }> }
  | { status: "failed-unexpectedly" };

/**
 * The next batch of the company list, or the fact of a failure.
 *
 * The error is not distinguished: there is nothing to show but the same notification.
 */
export type LoadMoreCompaniesResult =
  | { ok: true; items: CompanyListItem[]; nextCursor: Cursor | null }
  | { ok: false };

/**
 * The company row after Check now, or the fact of a failure. `company: null` -
 * the company is no longer in the tab (it was deleted in another browser tab),
 * and the list removes it. Failed sources are not a failure: the check happened,
 * and their state is in the row itself.
 */
export type CheckCompanyNowResult =
  | { ok: true; company: CompanyListItem | null }
  /** `check-running` - a general check is running; no reason - an unexpected failure. */
  | { ok: false; reason?: "check-running" };

/**
 * The result of Check all: how many sources were queued and the check state
 * right after the start (with it the indicator shows without waiting for a
 * poll), or why the check did not start. `unexpected` is a failure shown with
 * the shared toast.
 */
/** The Find new pages response: as for Check all, but without a run (task 5.10). */
export type StartFindNewPagesResult =
  | { ok: true; total: number; status: CheckStatus }
  | {
      ok: false;
      reason: "already-running" | "nothing-to-search" | "unexpected";
    };

export type StartCheckAllResult =
  | { ok: true; total: number; status: CheckStatus }
  | {
      ok: false;
      reason: "already-running" | "nothing-to-check" | "unexpected";
    };
