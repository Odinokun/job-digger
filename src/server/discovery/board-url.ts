/**
 * Адреса дошки ATS з будь-якого посилання на неї: саму дошку, вакансію, форму
 * відгуку чи вбудовану дошку (docs/discovery-and-parsing.md, розділ 5).
 *
 * Що вважати дошкою, кожна платформа вже знає у своєму парсері - тут лише
 * збирається єдина форма адреси з того, що парсер дістав. Тому джерело, знайдене
 * пошуком, парсер читає тим самим кодом, що й додане руками.
 */
import type { CareerPlatform } from "../../lib/companies/platform.ts";
import { ashbyBoard } from "../parsers/ashby.ts";
import { greenhouseBoardToken } from "../parsers/greenhouse.ts";
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
];

/**
 * Дошка, на яку веде посилання, або `null`, якщо це не дошка відомої
 * платформи. Посилання - абсолютна адреса; будь-що інше (`mailto:`, сміття)
 * теж дає `null`.
 */
export function boardUrlOf(link: string): BoardUrl | null {
  for (const [platform, boardOf] of BOARDS) {
    const url = boardOf(link);
    if (url !== null) {
      return { url, platform };
    }
  }

  return null;
}
