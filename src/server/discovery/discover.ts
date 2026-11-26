/**
 * The full search for a company's career sources - what Find pages runs
 * (src/server/discovery/README.md): three search methods, most reliable first,
 * and a trial read of every finding.
 */
import {
  detectPlatform,
  type CareerPlatform,
} from "../../lib/companies/platform.ts";
import { normalizeCompanyUrl } from "../../lib/companies/url.ts";
import type { HttpClient } from "../http/client.ts";
import { readSource } from "../parsers/read-source.ts";
import { fetchText } from "../parsers/shared.ts";
import { atsLinksOnPage } from "./ats-links.ts";
import { boardKey, type BoardUrl } from "./board-url.ts";
import { findBoardsByName } from "./by-name.ts";
import { findSiteCareerPages } from "./career-pages.ts";
import { boardOwnership, type BoardOwnership } from "./ownership.ts";

/**
 * The result of a trial read of a finding (task 5.06):
 *
 * - `read` - read, with this many vacancies right now;
 * - `unsupported` - nothing can read it: the company's own page without a parser;
 * - `failed` - there is a parser, but the board did not answer or answered with
 *   an error. It can be temporary, hence apart from `unsupported`.
 */
export type TrialRead =
  | {
      kind: "read";
      vacancies: number;
      /**
       * Only the first page was read and there is more (task 6.16): the list
       * shows "10+ vacancies". The first check after Save reads the whole board.
       */
      more: boolean;
    }
  | { kind: "unsupported" }
  | { kind: "failed" };

/** One finding in the Find pages list. */
export type Finding = {
  url: string;
  platform: CareerPlatform;
  /**
   * Where from: `site` - the company site leads here itself (a link to an ATS or
   * a career page), `name` - only a board with the same name, "found by name -
   * check it".
   */
  via: "site" | "name";
  /** The trial read before the list is shown; only what was read can be selected. */
  trial: TrialRead;
  /**
   * Whose board this is, for one found by name (task 5.05): `null` for findings
   * from the site - the link from the site is the proof.
   */
  ownership: BoardOwnership | null;
};

/**
 * Whether a finding can be trusted without a human check: the company site
 * leads to it itself, or the board found by name leads to the company site (the
 * author's decision of 19.11.2026, tasks/5.05-page-ownership-check.md).
 */
export function isReliableFinding(finding: Finding): boolean {
  return finding.via === "site" || finding.ownership?.kind === "confirmed";
}

/**
 * All findings for a company, in order of reliability: boards the site leads
 * to; the company's own career pages; boards found by name.
 *
 * A site that did not answer does not fail the search: search by name remains.
 * The same board found by several methods is one finding from the most reliable.
 *
 * The trial read uses the same parser as the check (`TrialRead`). Boards found
 * by name have already been read by the search: only one that was read exists.
 */
export async function discoverSources(
  company: { siteUrl: string | null; name: string },
  client: HttpClient,
): Promise<Finding[]> {
  return (await discoverCompany(company, client)).findings;
}

/** The findings and whether the company site answered. */
export interface Discovery {
  findings: Finding[];
  /**
   * The company site did not answer - nothing is known about its pages. Find
   * new pages then sets Check failed, not Not found (task 5.10). Without a site
   * it is `false`: there is no one to fail to answer.
   */
  siteFailed: boolean;
}

/** The same as `discoverSources`, together with whether the company site answered. */
export async function discoverCompany(
  company: { siteUrl: string | null; name: string },
  client: HttpClient,
): Promise<Discovery> {
  const [onSite, byName] = await Promise.all([
    company.siteUrl === null
      ? Promise.resolve([])
      : discoverOnSite(company.siteUrl, client),
    findBoardsByName(company, client),
  ]);
  const fromSite = onSite ?? [];

  const seen = new Set(fromSite.map((finding) => finding.url));
  const fromName: Finding[] = await Promise.all(
    byName
      .filter((board) => !seen.has(board.url))
      .map(async (board) => ({
        url: board.url,
        platform: board.platform,
        via: "name" as const,
        trial: {
          kind: "read" as const,
          vacancies: board.vacancies,
          more: board.more,
        },
        ownership:
          company.siteUrl === null
            ? { kind: "unknown" as const }
            : await ownershipOf(board.url, company.siteUrl, client),
      })),
  );

  return { findings: [...fromSite, ...fromName], siteFailed: onSite === null };
}

/**
 * The site's findings: boards from the home and career pages, then the pages
 * themselves. `null` means the home page did not answer.
 */
async function discoverOnSite(
  siteUrl: string,
  client: HttpClient,
): Promise<Finding[] | null> {
  const home = await fetchText(client, siteUrl);

  if (!home.ok) {
    return null;
  }

  const careers = await findSiteCareerPages(home, client);
  const boards = new Map<string, BoardUrl>();
  for (const board of [
    ...atsLinksOnPage(home.body, home.url),
    ...careers.boards,
  ]) {
    // The first finding stays: the home page comes before the career pages.
    if (!boards.has(boardKey(board))) {
      boards.set(boardKey(board), board);
    }
  }

  const read = await Promise.all(
    [...boards.values()].map(async (board) => ({
      ...board,
      via: "site" as const,
      trial: await trialRead(board, client),
      ownership: null,
    })),
  );

  const pages: Finding[] = careers.pages.map((url) => {
    const normalized = normalizeCompanyUrl(url);
    return {
      url,
      platform: normalized.ok ? detectPlatform(normalized.url) : "unsupported",
      via: "site",
      // An own page: there is no schema.org parser yet (task 3.11).
      trial: { kind: "unsupported" },
      ownership: null,
    };
  });

  return [...read, ...pages];
}

/**
 * A trial read of a board with the same parser as the check, but of the first
 * page only (task 6.16): the modal does not wait for minutes, and the first
 * check after Save reads the whole board.
 */
async function trialRead(
  board: BoardUrl,
  client: HttpClient,
): Promise<TrialRead> {
  const result = await readSource(board, client, "first-page");

  if (result === null) {
    return { kind: "unsupported" };
  }

  return result.ok
    ? {
        kind: "read",
        vacancies: result.vacancies.length,
        more: result.truncated === true,
      }
    : { kind: "failed" };
}

/**
 * Board ownership by its page for people (`boardOwnership`). A page that did not
 * answer says nothing - `unknown`.
 */
async function ownershipOf(
  boardUrl: string,
  siteUrl: string,
  client: HttpClient,
): Promise<BoardOwnership> {
  const page = await fetchText(client, boardUrl);
  return page.ok ? boardOwnership(page.body, siteUrl) : { kind: "unknown" };
}
