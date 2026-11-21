/**
 * Парсер PeopleForce: вакансії з публічної сторінки кар'єри компанії
 * (`{company}.peopleforce.io/careers`). Careers API PeopleForce вимагає ключ
 * компанії (https://developer.peopleforce.io/careers/v1/getting-started), тож
 * читаємо HTML - так, як його бачить відвідувач (README поруч, «PeopleForce»).
 */
import * as cheerio from "cheerio";

import type { HttpClient } from "../http/client.ts";
import {
  collectVacancies,
  fetchText,
  UNREADABLE,
  type ReadVacancy,
} from "./shared.ts";
import { pagesToRead, type ReadDepth } from "./vacancies-to-check.ts";
import type { ParsedVacancy, ParseResult } from "./types.ts";

/**
 * Адреса сайту кар'єри компанії (`https://team.peopleforce.io`) або `null`, якщо
 * адреса - не сайт компанії на PeopleForce. Компанія - єдиний субдомен перед
 * `peopleforce.io`; сам `peopleforce.io` і `www` - сайт платформи, не компанії.
 */
export function peopleforceSite(sourceUrl: string): string | null {
  let url: URL;

  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }

  const labels = url.hostname.split(".");

  if (
    labels.length !== 3 ||
    !url.hostname.endsWith(".peopleforce.io") ||
    labels[0] === "www"
  ) {
    return null;
  }

  return `https://${url.hostname}`;
}

/**
 * Чи це сторінка кар'єри PeopleForce, хоч би на якій адресі (задача 5.13):
 * компанія може тримати PeopleForce на своєму домені
 * (`peopleforce.softconstruct.com`), і за хостом його не впізнати.
 *
 * Ознак дві, і потрібні обидві: список `#results`, який читає парсер, і підпис
 * «Powered by PeopleForce» (`.credit` з посиланням на `peopleforce.io`) - він
 * є на кожній збереженій сторінці. Одне посилання на `peopleforce.io` - ще не
 * дошка: так пише будь-яка сторінка, що згадує цей HR-сервіс.
 */
export function isPeopleForcePage(html: string): boolean {
  const $ = cheerio.load(html);

  return (
    $("#results").length === 1 &&
    $('.credit a[href^="https://peopleforce.io"]').length > 0
  );
}

/** Сторінка списку: вакансії і чи є після неї ще одна. */
export type PeopleForcePage =
  | (Extract<ParseResult, { ok: true }> & { hasNext: boolean })
  | Extract<ParseResult, { ok: false }>;

/** Шлях вакансії: `/careers/v/{ID}-{slug}`, ID - число. */
const VACANCY_PATH = /^\/careers\/v\/(\d+)(?:-|$)/;

/** Лічильник «X - Y»: які за номером вакансії на цій сторінці. */
const RANGE = /^(\d+)\s*-\s*(\d+)$/;

/**
 * Вакансії однієї сторінки списку `/careers?page=N`.
 *
 * Сторінка - HTML, тож довіра до нуля тут окрема (src/server/parsers/README.md):
 * над картками PeopleForce пише лічильник «Displaying X - Y of N»,
 * і карток має бути рівно Y - X + 1. Числа в `<strong>` від мови не залежать,
 * текст навколо - залежить («Відображено ... з ...»). Немає ні лічильника, ні
 * карток - вакансій справді немає («There are currently no vacancies.»). Будь-
 * яке інше поєднання - змінена верстка, і невдала вся відповідь.
 *
 * `externalId` - числовий ID зі шляху, посилання - шлях від адреси сторінки,
 * локація - текст поруч з іконкою мітки на карті.
 *
 * Чи є наступна сторінка - теж з лічильника: Y менше за N. Посилання «далі»
 * в PeopleForce буває різним - у новій розмітці з `rel="next"`, у старішій
 * (SoftConstruct на власному домені, 21.11.2026) лише з `aria-label="next"`.
 * Пропущене посилання прочитало б 10 вакансій з 215 як увесь список, а решту
 * перевірка вважала б закритими.
 */
export function parsePeopleForcePage(
  html: string,
  pageUrl: string,
): PeopleForcePage {
  const $ = cheerio.load(html);
  const results = $("#results");

  if (results.length !== 1) {
    return UNREADABLE;
  }

  const cards = results
    .find("h4 a")
    .toArray()
    .map((link) => {
      const card = $(link).closest("h4").parent();
      const place = card.find(".fa-map-marker-alt").first().parent();

      return {
        href: $(link).attr("href"),
        title: $(link).text(),
        location: place.length === 0 ? null : place.text(),
      };
    });

  const counter = results
    .find("strong")
    .toArray()
    .map((element) => $(element).text().trim());

  if (counter.length === 0) {
    return cards.length === 0
      ? { ok: true, vacancies: [], skipped: 0, hasNext: false }
      : UNREADABLE;
  }

  const range = RANGE.exec(counter[0] ?? "");
  const total = /^\d+$/.test(counter[1] ?? "") ? Number(counter[1]) : null;

  if (
    counter.length !== 2 ||
    range === null ||
    total === null ||
    Number(range[2]) > total ||
    cards.length !== Number(range[2]) - Number(range[1]) + 1
  ) {
    return UNREADABLE;
  }

  const result = collectVacancies(cards, readerFor(pageUrl));

  if (!result.ok) {
    return result;
  }

  return { ...result, hasNext: Number(range[2]) < total };
}

function readerFor(pageUrl: string): ReadVacancy {
  return ({ href, title, location }) => {
    if (typeof href !== "string" || typeof title !== "string") {
      return "broken";
    }

    let url: URL;

    try {
      url = new URL(href, pageUrl);
    } catch {
      return "broken";
    }

    const id = VACANCY_PATH.exec(url.pathname)?.[1];

    if (id === undefined) {
      return "broken";
    }

    if (title.trim() === "") {
      return "skip";
    }

    const place = typeof location === "string" ? location.trim() : "";

    return {
      externalId: id,
      title: title.trim(),
      url: url.toString(),
      location: place === "" ? null : place,
    };
  };
}

/**
 * Сайт кар'єри джерела, яке вже збережене як PeopleForce. На `*.peopleforce.io`
 * - як у `peopleforceSite`; на будь-якому іншому хості - його origin: таке
 * джерело стало PeopleForce за розміткою сторінки (`isPeopleForcePage`,
 * задача 5.13), тож хост тут уже нічого не доводить.
 */
function careerSiteOf(sourceUrl: string): string | null {
  const onPlatform = peopleforceSite(sourceUrl);

  if (onPlatform !== null) {
    return onPlatform;
  }

  let url: URL;

  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }

  return url.protocol === "https:" || url.protocol === "http:"
    ? url.origin
    : null;
}

/** Скільки вакансій PeopleForce показує на сторінці `/careers` (не налаштовується). */
export const PEOPLEFORCE_PAGE_SIZE = 10;

/**
 * Вакансії кар'єрного джерела на PeopleForce: сайт компанії з адреси,
 * сторінки `/careers?page=N` через HTTP-клієнт і розбір кожної. Адреса, що не
 * веб-сторінка, - `unreadable` без жодного запиту.
 *
 * Наступна сторінка - лише поки лічильник каже, що список не скінчився
 * (`parsePeopleForcePage`): номер за межею списку PeopleForce не відхиляє, а
 * віддає останню сторінку ще раз (перевірено на Webellian 18.11.2026). Збій
 * будь-якої сторінки - збій усього джерела.
 */
export async function readPeopleForce(
  sourceUrl: string,
  client: HttpClient,
  {
    depth = "full",
    maxPages = pagesToRead({ pageSize: PEOPLEFORCE_PAGE_SIZE, depth }),
  }: { depth?: ReadDepth; maxPages?: number } = {},
): Promise<ParseResult> {
  const site = careerSiteOf(sourceUrl);

  if (site === null) {
    return UNREADABLE;
  }

  const vacancies: ParsedVacancy[] = [];
  let skipped = 0;
  // Стає `false`, лише коли список скінчився сам, а не на ліміті.
  let truncated = true;

  for (let page = 1; page <= maxPages; page += 1) {
    const pageUrl = `${site}/careers?page=${page}`;
    const fetched = await fetchText(client, pageUrl);

    if (!fetched.ok) {
      return fetched;
    }

    const parsed = parsePeopleForcePage(fetched.body, pageUrl);

    if (!parsed.ok) {
      return parsed;
    }

    vacancies.push(...parsed.vacancies);
    skipped += parsed.skipped;

    if (!parsed.hasNext) {
      truncated = false;
      break;
    }
  }

  return truncated
    ? { ok: true, vacancies, skipped, truncated: true }
    : { ok: true, vacancies, skipped };
}
