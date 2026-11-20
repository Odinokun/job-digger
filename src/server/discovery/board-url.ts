/**
 * Адреса дошки ATS з будь-якого посилання на неї: саму дошку, вакансію, форму
 * відгуку чи вбудовану дошку (docs/discovery-and-parsing.md, розділ 5).
 *
 * Що вважати дошкою, кожна платформа вже знає у своєму парсері - тут лише
 * збирається єдина форма адреси з того, що парсер дістав. Тому джерело, знайдене
 * пошуком, парсер читає тим самим кодом, що й додане руками.
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
import { softgardenBoardUrl, softgardenSource } from "../parsers/softgarden.ts";
import { workableAccount } from "../parsers/workable.ts";
import { leverSite } from "../parsers/lever.ts";
import { peopleforceSite } from "../parsers/peopleforce.ts";
import { workdaySite } from "../parsers/workday.ts";

/** Дошка ATS, на яку веде посилання. */
export type BoardUrl = { url: string; platform: CareerPlatform };

type BoardOf = (link: string) => string | null;

/**
 * Хост для Greenhouse - `job-boards.greenhouse.io`: на ньому дошки показує сама
 * платформа зараз, а `boards.greenhouse.io` - старіший (README парсерів).
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
      // Посилання на окрему вакансію лишається як є: аліас компанії з нього
      // видно лише після запиту, а його робить парсер.
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
    "workable",
    (link) => {
      // Коротке посилання на вакансію (`/j/{shortcode}`) акаунта не містить -
      // тоді знахідки немає.
      const account = workableAccount(link);
      return account === null
        ? null
        : `https://apply.workable.com/${encodeURIComponent(account)}/`;
    },
  ],
];

/**
 * Дошка, на яку веде посилання, або `null`, якщо це не дошка відомої
 * платформи. Посилання - абсолютна адреса; будь-що інше (`mailto:`, сміття)
 * теж дає `null`.
 *
 * Відома ATS без парсера (`known-ats.ts`) - джерело з платформою
 * `unsupported`. Форми її дошки ми не знаємо, тож адреса - саме посилання без
 * рядка запиту й якоря (задача 5.15).
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
 * За чим склеювати знахідки: одна на дошку, а для відомої ATS без парсера -
 * одна на платформу, бо різні посилання на неї ми не вміємо звести до однієї
 * дошки (вакансії однієї дошки інакше дали б кілька знахідок).
 */
export function boardKey(board: BoardUrl): string {
  const known =
    board.platform === "unsupported" ? knownAtsName(board.url) : null;
  return known === null ? board.url : `known-ats:${known}`;
}
