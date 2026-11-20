/**
 * Парсер Workday: вакансії з API, яким користується сам career site Workday
 * (`/wday/cxs/{tenant}/{site}/jobs`). Публічної документації це API не має -
 * усе тут перевірено справжніми запитами (README поруч, «Workday»).
 */
import type { HttpClient } from "../http/client.ts";
import {
  collectVacancies,
  isRecord,
  postJson,
  UNREADABLE,
  type ReadVacancy,
} from "./shared.ts";
import { pagesToRead, type ReadDepth } from "./vacancies-to-check.ts";
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

/**
 * Скільки вакансій просити за раз. Це найбільше, що Workday приймає: на
 * `limit: 50` він відповідає 400 (перевірено на NVIDIA 18.11.2026).
 */
export const WORKDAY_PAGE_SIZE = 20;

/**
 * Вакансії кар'єрного джерела на Workday: сайт з адреси, сторінки списку через
 * POST (`offset`/`limit`) і розбір кожної. Адреса не Workday - `unreadable` без
 * жодного запиту.
 *
 * Кінець списку - за `total` першої сторінки або за неповною сторінкою. Просто
 * «питати, доки не прийде порожня» не можна: на наступних сторінках `total`
 * дорівнює 0, а з `offset` від 2000 Workday знову віддає першу сторінку.
 *
 * Збій будь-якої сторінки - збій усього джерела, як у Lever.
 */
export async function readWorkday(
  sourceUrl: string,
  client: HttpClient,
  {
    depth = "full",
    maxPages = pagesToRead({ pageSize: WORKDAY_PAGE_SIZE, depth }),
  }: { depth?: ReadDepth; maxPages?: number } = {},
): Promise<ParseResult> {
  const site = workdaySite(sourceUrl);

  if (site === null) {
    return UNREADABLE;
  }

  const vacancies: ParsedVacancy[] = [];
  let skipped = 0;
  let total = Infinity;
  // Стає `false`, лише коли список скінчився сам, а не на ліміті.
  let truncated = true;

  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * WORKDAY_PAGE_SIZE;
    const fetched = await postJson(client, site.api, {
      appliedFacets: {},
      limit: WORKDAY_PAGE_SIZE,
      offset,
      searchText: "",
    });

    if (!fetched.ok) {
      return fetched;
    }

    const parsed = parseWorkdayJobs(fetched.answer, site.jobBase);

    if (!parsed.ok) {
      return parsed;
    }

    vacancies.push(...parsed.vacancies);
    skipped += parsed.skipped;

    if (page === 0 && isRecord(fetched.answer)) {
      const { total: first } = fetched.answer;
      total = typeof first === "number" ? first : Infinity;
    }

    // Пропущені записи теж займали місце на сторінці.
    const read = parsed.vacancies.length + parsed.skipped;

    if (read < WORKDAY_PAGE_SIZE || offset + read >= total) {
      truncated = false;
      break;
    }
  }

  return truncated
    ? { ok: true, vacancies, skipped, truncated: true }
    : { ok: true, vacancies, skipped };
}
