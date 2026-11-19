/**
 * Пошук кар'єрних джерел компанії цілком - те, що запускає Find pages
 * (docs/discovery-and-parsing.md, розділ 5): три способи пошуку від
 * найнадійнішого і пробне читання кожної знахідки.
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
import type { BoardUrl } from "./board-url.ts";
import { findBoardsByName } from "./by-name.ts";
import { findSiteCareerPages } from "./career-pages.ts";
import { boardOwnership, type BoardOwnership } from "./ownership.ts";

/** Одна знахідка в списку Find pages. */
export type Finding = {
  url: string;
  platform: CareerPlatform;
  /**
   * Звідки: `site` - сайт компанії веде сюди сам (посилання на ATS чи
   * кар'єрна сторінка), `name` - лише дошка з такою самою назвою, «знайдено
   * за назвою - перевір».
   */
  via: "site" | "name";
  /** Скільки вакансій прочитало пробне читання, або `null` - не читається. */
  vacancies: number | null;
  /**
   * Чия дошка, знайдена за назвою (задача 5.05): `null` для знахідок із сайту
   * - посилання з сайту і є доказом.
   */
  ownership: BoardOwnership | null;
};

/**
 * Чи можна покладатися на знахідку без перевірки людиною: сайт компанії веде
 * на неї сам, або дошка за назвою веде на сайт компанії (рішення автора
 * 19.11.2026, tasks/5.05-page-ownership-check.md).
 */
export function isReliableFinding(finding: Finding): boolean {
  return finding.via === "site" || finding.ownership?.kind === "confirmed";
}

/**
 * Усі знахідки для компанії, у порядку надійності: дошки, на які веде сайт;
 * власні кар'єрні сторінки; дошки за назвою.
 *
 * Сайт, що не відповів, - не провал пошуку: лишається пошук за назвою. Та сама
 * дошка, знайдена кількома способами, - одна знахідка з найнадійнішого.
 *
 * Пробне читання тут просте - той самий парсер, що й у перевірці; власна
 * сторінка, для якої парсера немає, - `vacancies: null`. Деталі пробного
 * читання - задача 5.06.
 */
export async function discoverSources(
  company: { siteUrl: string | null; name: string },
  client: HttpClient,
): Promise<Finding[]> {
  const [fromSite, byName] = await Promise.all([
    company.siteUrl === null
      ? Promise.resolve([])
      : discoverOnSite(company.siteUrl, client),
    findBoardsByName(company, client),
  ]);

  const seen = new Set(fromSite.map((finding) => finding.url));
  const fromName: Finding[] = await Promise.all(
    byName
      .filter((board) => !seen.has(board.url))
      .map(async (board) => ({
        ...board,
        via: "name" as const,
        ownership:
          company.siteUrl === null
            ? { kind: "unknown" as const }
            : await ownershipOf(board.url, company.siteUrl, client),
      })),
  );

  return [...fromSite, ...fromName];
}

/** Знахідки сайту: дошки з головної й кар'єрних сторінок, потім самі сторінки. */
async function discoverOnSite(
  siteUrl: string,
  client: HttpClient,
): Promise<Finding[]> {
  const home = await fetchText(client, siteUrl);

  if (!home.ok) {
    return [];
  }

  const careers = await findSiteCareerPages(home, client);
  const boards = new Map<string, BoardUrl>();
  for (const board of [
    ...atsLinksOnPage(home.body, home.url),
    ...careers.boards,
  ]) {
    boards.set(board.url, board);
  }

  const read = await Promise.all(
    [...boards.values()].map(async (board) => ({
      ...board,
      via: "site" as const,
      vacancies: await trialRead(board, client),
      ownership: null,
    })),
  );

  const pages: Finding[] = careers.pages.map((url) => {
    const normalized = normalizeCompanyUrl(url);
    return {
      url,
      platform: normalized.ok ? detectPlatform(normalized.url) : "unsupported",
      via: "site",
      vacancies: null,
      ownership: null,
    };
  });

  return [...read, ...pages];
}

/** Кількість вакансій або `null`, якщо джерело не прочиталось чи нічим читати. */
async function trialRead(
  board: BoardUrl,
  client: HttpClient,
): Promise<number | null> {
  const result = await readSource(board, client);
  return result?.ok ? result.vacancies.length : null;
}

/**
 * Належність дошки за її сторінкою для людей (`boardOwnership`). Сторінка, що
 * не відповіла, нічого не каже - `unknown`.
 */
async function ownershipOf(
  boardUrl: string,
  siteUrl: string,
  client: HttpClient,
): Promise<BoardOwnership> {
  const page = await fetchText(client, boardUrl);
  return page.ok ? boardOwnership(page.body, siteUrl) : { kind: "unknown" };
}
