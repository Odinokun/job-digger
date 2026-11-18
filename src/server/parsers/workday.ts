/**
 * Парсер Workday: вакансії з API, яким користується сам career site Workday
 * (`/wday/cxs/{tenant}/{site}/jobs`). Публічної документації це API не має -
 * усе тут перевірено справжніми запитами (README поруч, «Workday»).
 */
import type { HttpClient } from "../http/client.ts";
import {
  collectVacancies,
  fetchJson,
  isRecord,
  UNREADABLE,
  type ReadVacancy,
} from "./shared.ts";
import type { ParsedVacancy, ParseResult } from "./types.ts";

/** Куди йти по вакансії сайту і звідки будувати посилання на неї. */
export interface WorkdaySite {
  /** Адреса списку вакансій, на неї йде POST. */
  api: string;
  /** Адреса career site; посилання на вакансію - вона плюс `externalPath`. */
  jobBase: string;
}

/** Сегмент мови на початку шляху: `en-US`, `de-DE`. */
const LOCALE = /^[a-z]{2}-[A-Z]{2}$/;

/**
 * Сайт Workday з адреси джерела або `null`, якщо адреса - не career site Workday.
 * Два формати (`src/lib/companies/platform.ts`):
 *
 * - `{tenant}.wd5.myworkdayjobs.com/{site}` - tenant у субдомені;
 * - `wd5.myworkdaysite.com/recruiting/{tenant}/{site}` - tenant у шляху.
 *
 * Сегмент мови (`/en-US/...`) пропускається, хвіст після назви сайту (посилання на
 * вакансію) - теж.
 */
export function workdaySite(sourceUrl: string): WorkdaySite | null {
  let url: URL;

  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const path = LOCALE.test(segments[0] ?? "") ? segments.slice(1) : segments;
  const labels = url.hostname.split(".");
  const origin = `https://${url.hostname}`;

  if (url.hostname.endsWith(".myworkdayjobs.com") && labels.length > 3) {
    const [tenant] = labels;
    const [site] = path;

    return tenant === undefined || site === undefined
      ? null
      : siteOf(origin, tenant, site, `${origin}/${site}`);
  }

  if (url.hostname.endsWith(".myworkdaysite.com") && path[0] === "recruiting") {
    const [, tenant, site] = path;

    return tenant === undefined || site === undefined
      ? null
      : siteOf(origin, tenant, site, `${origin}/recruiting/${tenant}/${site}`);
  }

  return null;
}

function siteOf(
  origin: string,
  tenant: string,
  site: string,
  jobBase: string,
): WorkdaySite {
  return {
    api: `${origin}/wday/cxs/${tenant}/${site}/jobs`,
    jobBase,
  };
}

/**
 * Вакансії з відповіді на POST `.../jobs` - обʼєкта з масивом `jobPostings`.
 *
 * `externalId` - `externalPath` (`/job/Poland-Warsaw/Engineer_JR1`): окремого
 * ID список не дає, а номер заявки з `bulletFields` не унікальний - в однієї
 * заявки буває кілька оголошень (`..._JR2028965-1`). Посилання - `jobBase` плюс
 * той самий шлях, локація - `locationsText` як є (буває «2 Locations»: усі
 * локації дає лише окремий запит на кожну вакансію).
 */
export function parseWorkdayJobs(
  answer: unknown,
  jobBase: string,
): ParseResult {
  if (!isRecord(answer) || !Array.isArray(answer.jobPostings)) {
    return UNREADABLE;
  }

  return collectVacancies(answer.jobPostings, readerFor(jobBase));
}

function readerFor(jobBase: string): ReadVacancy {
  return ({ title, externalPath, locationsText }) => {
    if (
      typeof title !== "string" ||
      typeof externalPath !== "string" ||
      !externalPath.startsWith("/")
    ) {
      return "broken";
    }

    if (title.trim() === "") {
      return "skip";
    }

    const location =
      typeof locationsText === "string" ? locationsText.trim() : "";

    return {
      externalId: externalPath,
      title: title.trim(),
      url: `${jobBase}${externalPath}`,
      location: location === "" ? null : location,
    };
  };
}
