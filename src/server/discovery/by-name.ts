/**
 * The third, least reliable search method: ATS boards by company name
 * (src/server/discovery/README.md). Such findings are only "found by name -
 * check it": the same board name may belong to another company.
 */

import type { CareerPlatform } from "../../lib/companies/platform.ts";
import type { HttpClient } from "../http/client.ts";
import { hurmaBoardUrl } from "../parsers/hurma.ts";
import { readSource } from "../parsers/read-source.ts";
import type { BoardUrl } from "./board-url.ts";

/**
 * The address of a board named `slug` on every platform where it can be
 * guessed. Workday is not here: its address has a cluster number and a site
 * name (`nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite`).
 */
const BOARD_BY_SLUG: Array<[CareerPlatform, (slug: string) => string]> = [
  ["greenhouse", (slug) => `https://job-boards.greenhouse.io/${slug}`],
  ["lever", (slug) => `https://jobs.lever.co/${slug}`],
  ["ashby", (slug) => `https://jobs.ashbyhq.com/${slug}`],
  ["peopleforce", (slug) => `https://${slug}.peopleforce.io/careers`],
  ["breezy", (slug) => `https://${slug}.breezy.hr`],
  ["hurma", hurmaBoardUrl],
  ["personio", (slug) => `https://${slug}.jobs.personio.de`],
  // The old board only: softgarden career site addresses rarely match the
  // company name (`engineering-crown`, `jobs-gfo-online`).
  ["softgarden", (slug) => `https://${slug}.softgarden.io/en/vacancies`],
  ["workable", (slug) => `https://apply.workable.com/${slug}/`],
  ["bamboohr", (slug) => `https://${slug}.bamboohr.com/careers`],
  ["pinpoint", (slug) => `https://${slug}.pinpointhq.com/`],
];

/**
 * A board found by name and how many vacancies its first page has; `more`
 * means there are more pages (task 6.16).
 */
export type BoardByName = BoardUrl & { vacancies: number; more: boolean };

/** Host labels that are not a company name: `www.acme.com`, `careers.acme.com`. */
const SERVICE_LABELS = new Set([
  "www",
  "careers",
  "career",
  "jobs",
  "karriere",
]);

/**
 * Board name variants from the company name and its site address, without
 * repeats.
 *
 * - the name joined (`boschua`) and, if there are several words, hyphenated
 *   (`bosch-ua`): platforms write a board name in one of these forms;
 * - the first domain label (`bosch` from `bosch.de/ua`), skipping service ones
 *   (`www`, `careers`).
 *
 * Diacritics are stripped, and everything except Latin letters and digits is a
 * separator. A name without Latin letters ("Монобанк") gives no variants.
 */
export function nameSlugs({
  name,
  siteUrl,
}: {
  name: string;
  siteUrl: string | null;
}): string[] {
  const words = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const slugs = [words.join("")];
  if (words.length > 1) {
    slugs.push(words.join("-"));
  }
  if (siteUrl !== null) {
    slugs.push(domainLabel(siteUrl));
  }

  return [...new Set(slugs.filter((slug) => slug.length >= 2))];
}

function domainLabel(siteUrl: string): string {
  const labels = new URL(siteUrl).hostname.split(".");
  return labels.find((label) => !SERVICE_LABELS.has(label)) ?? "";
}

/**
 * The boards that exist under one of the `nameSlugs` names - in the order of the
 * name variants, and for each, of the platforms.
 *
 * Whether a board exists is decided by reading it with the same parser as the
 * check: for a board that does not exist all four platforms answer 404 (checked
 * 19.11.2026). This also tells how many vacancies the board has - what the
 * trial read shows (5.06). Any failure means "no board": this is guessing, and
 * one platform failing does not fail the whole search.
 *
 * Requests run in parallel: the platforms are different hosts, and the HTTP
 * client keeps the per-host limit and pauses.
 */
export async function findBoardsByName(
  company: { name: string; siteUrl: string | null },
  client: HttpClient,
): Promise<BoardByName[]> {
  const candidates = nameSlugs(company).flatMap((slug) =>
    BOARD_BY_SLUG.map(([platform, urlOf]) => ({ platform, url: urlOf(slug) })),
  );

  const read = await Promise.all(
    candidates.map(async (board) => {
      // The first page only, like the trial read in `discover.ts`.
      const result = await readSource(board, client, "first-page");
      return result?.ok
        ? {
            ...board,
            vacancies: result.vacancies.length,
            more: result.truncated === true,
          }
        : null;
    }),
  );

  return read.filter((board) => board !== null);
}
