/**
 * Перший і найнадійніший спосіб пошуку: посилання з сайту компанії на ATS
 * (docs/discovery-and-parsing.md, розділ 5, пункт 3) - наприклад, кнопка Jobs
 * веде на Greenhouse.
 */
import * as cheerio from "cheerio";

import type { HttpClient } from "../http/client.ts";
import { fetchText } from "../parsers/shared.ts";
import type { ParserError } from "../parsers/types.ts";
import { boardKey, boardUrlOf, type BoardUrl } from "./board-url.ts";

/**
 * Де на сторінці бувають адреси дошок: звичайне посилання, вбудована дошка в
 * iframe (Ashby) і скрипт вбудовування (Greenhouse - `embed/job_board/js?for=`).
 */
const ADDRESSES = "a[href], iframe[src], script[src]";

/**
 * Дошки ATS, на які веде сторінка, - по одній на дошку, у порядку появи.
 *
 * Адреси розвʼязуються відносно самої сторінки (`pageUrl`), тож `//jobs.lever.co`
 * теж знаходиться. Відносний шлях лишається на сайті компанії, а її власні
 * сторінки - справа іншого способу пошуку (5.03).
 */
export function atsLinksOnPage(html: string, pageUrl: string): BoardUrl[] {
  const $ = cheerio.load(html);
  const found = new Map<string, BoardUrl>();

  // Один селектор на всі види: так елементи йдуть у порядку документа, а не
  // групами за видом.
  $(ADDRESSES).each((_, element) => {
    const $element = $(element);
    const address = $element.attr("href") ?? $element.attr("src");
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

/** Дошки, на які веде головна сторінка компанії, або чому її не прочитали. */
export type SiteAtsLinks =
  { ok: true; boards: BoardUrl[] } | { ok: false; error: ParserError };

/**
 * Дошки ATS з головної сторінки сайту компанії (`siteUrl` - абсолютна адреса).
 * Відносні посилання розвʼязуються від адреси, на якій сторінка опинилась після
 * редиректів: `acme.example` часто веде на `acme.example/en/`.
 *
 * Помилки - ті самі, що в парсерів (`not-found`, `bad-status`,
 * `fetch-failed`): сайт, який не відповів, для пошуку теж «не прочитано».
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
