/**
 * The ATS board address from any link to it: the board itself, a vacancy, an
 * application form or an embedded board (src/server/discovery/README.md).
 *
 * Each platform's parser already knows what counts as a board - this only
 * builds a single address form from what the parser extracted. That is why a
 * source found by search is read by the same parser code as one added by hand.
 */
import { knownAtsName } from "../../lib/companies/known-ats.ts";
import type { CareerPlatform } from "../../lib/companies/platform.ts";
import { ashbyBoard } from "../parsers/ashby.ts";
import { bamboohrCompany } from "../parsers/bamboohr.ts";
import { breezyCompany } from "../parsers/breezy.ts";
import {
  cleverstaffBoardUrl,
  cleverstaffSource,
} from "../parsers/cleverstaff.ts";
import { greenhouseBoardToken } from "../parsers/greenhouse.ts";
import { hurmaBoardUrl, hurmaCompany } from "../parsers/hurma.ts";
import { personioBoard } from "../parsers/personio.ts";
import { pinpointCompany } from "../parsers/pinpoint.ts";
import { softgardenBoardUrl, softgardenSource } from "../parsers/softgarden.ts";
import {
  talentadoreBoard,
  talentadoreBoardUrl,
} from "../parsers/talentadore.ts";
import { workableAccount } from "../parsers/workable.ts";
import { leverSite } from "../parsers/lever.ts";
import { peopleforceSite } from "../parsers/peopleforce.ts";
import { workdaySite } from "../parsers/workday.ts";

/** The ATS board a link leads to. */
export type BoardUrl = { url: string; platform: CareerPlatform };

type BoardOf = (link: string) => string | null;

/**
 * The host for Greenhouse is `job-boards.greenhouse.io`: the platform shows
 * boards there now, and `boards.greenhouse.io` is the older one (parsers README).
 */
const BOARDS: Array<[CareerPlatform, BoardOf]> = [
  [
    "greenhouse",
    (link) => {
      const token = greenhouseBoardToken(link);
      return token === null
        ? null
        : `https://job-boards.greenhouse.io/${encodeURIComponent(token)}`;
    },
  ],
  [
    "lever",
    (link) => {
      const found = leverSite(link);
      if (found === null) return null;
      const host = found.region === "eu" ? "jobs.eu.lever.co" : "jobs.lever.co";
      return `https://${host}/${encodeURIComponent(found.site)}`;
    },
  ],
  [
    "ashby",
    (link) => {
      const board = ashbyBoard(link);
      return board === null
        ? null
        : `https://jobs.ashbyhq.com/${encodeURIComponent(board)}`;
    },
  ],
  ["workday", (link) => workdaySite(link)?.jobBase ?? null],
  [
    "peopleforce",
    (link) => {
      const site = peopleforceSite(link);
      return site === null ? null : `${site}/careers`;
    },
  ],
  [
    "breezy",
    (link) => {
      const company = breezyCompany(link);
      return company === null ? null : `https://${company}.breezy.hr`;
    },
  ],
  [
    "cleverstaff",
    (link) => {
      // A link to a single vacancy stays as it is: the company alias only shows
      // after a request, and the parser makes it.
      const source = cleverstaffSource(link);
      if (source === null) return null;
      return "alias" in source
        ? cleverstaffBoardUrl(source.alias)
        : `https://cleverstaff.net/i/vacancy-${encodeURIComponent(source.vacancy)}`;
    },
  ],
  [
    "hurma",
    (link) => {
      const company = hurmaCompany(link);
      return company === null ? null : hurmaBoardUrl(company);
    },
  ],
  ["personio", personioBoard],
  [
    "softgarden",
    (link) => {
      const source = softgardenSource(link);
      return source === null ? null : softgardenBoardUrl(source);
    },
  ],
  [
    "bamboohr",
    (link) => {
      const company = bamboohrCompany(link);
      return company === null
        ? null
        : `https://${company}.bamboohr.com/careers`;
    },
  ],
  [
    "pinpoint",
    (link) => {
      const company = pinpointCompany(link);
      return company === null ? null : `https://${company}.pinpointhq.com/`;
    },
  ],
  [
    "talentadore",
    (link) => {
      const token = talentadoreBoard(link);
      return token === null ? null : talentadoreBoardUrl(token);
    },
  ],
  [
    "workable",
    (link) => {
      // A short vacancy link (`/j/{shortcode}`) has no account in it - then
      // there is no finding.
      const account = workableAccount(link);
      return account === null
        ? null
        : `https://apply.workable.com/${encodeURIComponent(account)}/`;
    },
  ],
];

/**
 * The board a link leads to, or `null` if it is not a board of a known
 * platform. The link is an absolute address; anything else (`mailto:`, junk)
 * also gives `null`.
 *
 * A known ATS without a parser (`known-ats.ts`) is a source with the
 * `unsupported` platform. We don't know its board form, so the address is the
 * link itself without the query string and fragment (task 5.15).
 */
export function boardUrlOf(link: string): BoardUrl | null {
  for (const [platform, boardOf] of BOARDS) {
    const url = boardOf(link);
    if (url !== null) {
      return { url, platform };
    }
  }

  if (knownAtsName(link) !== null) {
    const url = new URL(link);
    return { url: `${url.origin}${url.pathname}`, platform: "unsupported" };
  }

  return null;
}

/**
 * What findings are merged by: one per board, and for a known ATS without a
 * parser one per platform, because we cannot reduce different links to it to a
 * single board (vacancies of one board would otherwise give several findings).
 */
export function boardKey(board: BoardUrl): string {
  const known =
    board.platform === "unsupported" ? knownAtsName(board.url) : null;
  return known === null ? board.url : `known-ats:${known}`;
}
