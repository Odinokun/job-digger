/**
 * The first and most reliable search method: links from the company site to an
 * ATS (src/server/discovery/README.md) - for example, a Jobs button that leads
 * to Greenhouse.
 */
import * as cheerio from "cheerio";

import type { HttpClient } from "../http/client.ts";
import { fetchText } from "../parsers/shared.ts";
import type { ParserError } from "../parsers/types.ts";
import { boardKey, boardUrlOf, type BoardUrl } from "./board-url.ts";

/**
 * Where board addresses appear on a page: an ordinary link, a board embedded in
 * an iframe (Ashby), an embed script (Greenhouse - `embed/job_board/js?for=`)
 * and a widget's data address (TalentAdore - `data-url`, task 6.28). Foreign
 * addresses are filtered out by `boardUrlOf`, so a generic `data-url` adds
 * nothing extra.
 */
const ADDRESSES = "a[href], iframe[src], script[src], [data-url]";

/**
 * The ATS boards a page links to - one per board, in order of appearance.
 *
 * Addresses resolve against the page itself (`pageUrl`), so `//jobs.lever.co`
 * is found too. A relative path stays on the company site, and the company's
 * own pages are the job of another search method (5.03).
 */
export function atsLinksOnPage(html: string, pageUrl: string): BoardUrl[] {
  const $ = cheerio.load(html);
  const found = new Map<string, BoardUrl>();

  // One selector for every kind: this way elements come in document order, not
  // grouped by kind.
  $(ADDRESSES).each((_, element) => {
    const $element = $(element);
    const address =
      $element.attr("href") ??
      $element.attr("src") ??
      $element.attr("data-url");
    const board = address === undefined ? null : boardOf(address, pageUrl);

    if (board !== null && !found.has(boardKey(board))) {
      found.set(boardKey(board), board);
    }
  });

  return [...found.values()];
}

function boardOf(address: string, pageUrl: string): BoardUrl | null {
  let url: URL;

  try {
    url = new URL(address, pageUrl);
  } catch {
    return null;
  }

  return boardUrlOf(url.toString());
}

/** The boards the company's home page links to, or why it could not be read. */
export type SiteAtsLinks =
  { ok: true; boards: BoardUrl[] } | { ok: false; error: ParserError };

/**
 * ATS boards from the home page of the company site (`siteUrl` is an absolute
 * address). Relative links resolve against the address the page ended up at
 * after redirects: `acme.example` often leads to `acme.example/en/`.
 *
 * The errors are the parsers' ones (`not-found`, `bad-status`, `fetch-failed`):
 * a site that did not answer is "not read" for the search as well.
 */
export async function findSiteAtsLinks(
  siteUrl: string,
  client: HttpClient,
): Promise<SiteAtsLinks> {
  const page = await fetchText(client, siteUrl);

  if (!page.ok) {
    return page;
  }

  return { ok: true, boards: atsLinksOnPage(page.body, page.url) };
}
