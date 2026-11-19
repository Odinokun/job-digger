/**
 * Парсер softgarden (задача 3.28). У softgarden два продукти з публічними
 * дошками, і читаються обидва:
 *
 * - стара дошка `https://{company}.softgarden.io/{lang}/vacancies` - серверний
 *   HTML з усіма вакансіями одразу (сторінки малює JavaScript);
 * - новий кар'єрний сайт `https://{company}.career.softgarden.de` - фід
 *   schema.org `DataFeed` на `/jobs.feed.json`.
 *
 * Документований API (dev.softgarden.de, `api.softgarden.io`) потребує client
 * ID від softgarden, тож для нас закритий. Обидва формати перевірено
 * справжніми запитами 19.11.2026, документації в них немає.
 */
import * as cheerio from "cheerio";

import type { HttpClient } from "../http/client.ts";
import {
  collectVacancies,
  fetchJson,
  fetchText,
  isRecord,
  isWebUrl,
  UNREADABLE,
  type ReadVacancy,
} from "./shared.ts";
import type { ParseResult } from "./types.ts";

const BOARD_DOMAIN = "softgarden.io";
const SITE_DOMAIN = "career.softgarden.de";

/** Піддомени `softgarden.io`, що не є дошками компаній. */
const SERVICE_LABELS = new Set(["www", "api", "dev", "app"]);

/** Джерело softgarden: стара дошка чи новий кар'єрний сайт. */
export type SoftgardenSource = { kind: "board" | "site"; origin: string };

/**
 * Дошка чи кар'єрний сайт з будь-якої їхньої адреси, зокрема з посилання на
 * вакансію, або `null`, якщо це не softgarden.
 */
export function softgardenSource(sourceUrl: string): SoftgardenSource | null {
  let host: string;

  try {
    host = new URL(sourceUrl).hostname.toLowerCase();
  } catch {
    return null;
  }

  const company = (domain: string) => {
    if (!host.endsWith(`.${domain}`)) return null;
    const label = host.slice(0, -domain.length - 1);
    return label.includes(".") ? null : label;
  };

  const site = company(SITE_DOMAIN);
  if (site !== null) {
    return { kind: "site", origin: `https://${site}.${SITE_DOMAIN}` };
  }

  const board = company(BOARD_DOMAIN);
  if (board !== null && !SERVICE_LABELS.has(board)) {
    return { kind: "board", origin: `https://${board}.${BOARD_DOMAIN}` };
  }

  return null;
}

/** Адреса, з якої читається джерело: список вакансій дошки або сайт. */
export function softgardenBoardUrl(source: SoftgardenSource): string {
  return source.kind === "board"
    ? `${source.origin}/en/vacancies`
    : source.origin;
}

/** Ознака сторінки старої дошки: дані мапи вакансій у скрипті сторінки. */
const MAP_DATA = "SG.allJobLocations = [";

const POSTING_ID = /SG\.allJobLocations\.push\(\{[^}]*?postingId:\s*(\d+)/g;

/**
 * Вакансії старої дошки з HTML. `pageUrl` - адреса сторінки після редиректів,
 * від неї розвʼязуються відносні посилання (`../job/{id}/...`).
 *
 * Картка - `.matchElement#job_id_{id}` (шапка таблиці - теж `.matchElement`), назва й посилання - `.title a`,
 * локації - `.location-view-item` через кому. Лічильника в HTML немає (його
 * підставляє JavaScript), тому нулю довіряємо через дані мапи: кожен
 * `postingId` з `SG.allJobLocations` має бути серед карток. Інакше змінена
 * верстка дала б «нуль вакансій» - видалення всіх.
 */
export function parseSoftgardenBoard(
  html: string,
  pageUrl: string,
): ParseResult {
  if (!html.includes(MAP_DATA)) {
    return UNREADABLE;
  }

  const $ = cheerio.load(html);
  // Шапка таблиці теж `.matchElement`, але з `.matchHeadline`.
  const cards = $(".matchElement:not(.matchHeadline)")
    .toArray()
    .map((element) => {
      const card = $(element);
      const link = card.find(".title a").first();

      return {
        id: /^job_id_(\d+)$/.exec(card.attr("id") ?? "")?.[1] ?? null,
        title: link.length === 0 ? null : link.text(),
        href: link.attr("href") ?? null,
        places: card
          .find(".location-view-item")
          .toArray()
          .map((place) => $(place).text()),
      };
    });

  const shown = new Set(cards.map((card) => card.id));
  const mapped = [...html.matchAll(POSTING_ID)].map((match) => match[1]);

  if (mapped.some((id) => !shown.has(id))) {
    return UNREADABLE;
  }

  return collectVacancies(cards, boardVacancyOn(pageUrl));
}

const boardVacancyOn =
  (pageUrl: string): ReadVacancy =>
  ({ id, title, href, places }) => {
    if (
      typeof id !== "string" ||
      typeof title !== "string" ||
      typeof href !== "string"
    ) {
      return "broken";
    }

    let url: URL;
    try {
      url = new URL(href, pageUrl);
    } catch {
      return "skip";
    }
    // `jobDbPVId` і мова в рядку запиту до вакансії не належать.
    url.search = "";

    if (title.trim() === "" || !isWebUrl(url.toString())) {
      return "skip";
    }

    return {
      externalId: id,
      title: title.trim(),
      url: url.toString(),
      location: joinPlaces(
        (Array.isArray(places) ? places : []).map((place) =>
          // Кома між локаціями - частина тексту кожної, крім останньої.
          String(place).trim().replace(/,$/, ""),
        ),
        ", ",
      ),
    };
  };

/**
 * Вакансії нового кар'єрного сайту з фіду: `DataFeed` з `dataFeedElement`,
 * де кожен `item` - `JobPosting`. `numberOfItems` має дорівнювати кількості
 * записів - так видно, що фід цілий.
 *
 * `externalId` - `identifier.value` (він же в адресі `/jobs/{id}/...`), назва -
 * `title`, посилання - `url`, локація - місто (або регіон) і країна кожного
 * `jobLocation`; кілька місць - через «; ». Порожні частини адреси softgarden
 * заповнює «-», вони відкидаються.
 */
export function parseSoftgardenFeed(answer: unknown): ParseResult {
  if (
    !isRecord(answer) ||
    !Array.isArray(answer.dataFeedElement) ||
    answer.numberOfItems !== answer.dataFeedElement.length
  ) {
    return UNREADABLE;
  }

  return collectVacancies(answer.dataFeedElement, (element) =>
    isRecord(element.item) ? feedVacancy(element.item) : "broken",
  );
}

const feedVacancy: ReadVacancy = (job) => {
  const { title, url, identifier, jobLocation } = job;
  const id = isRecord(identifier) ? identifier.value : undefined;

  if (
    (typeof id !== "number" && typeof id !== "string") ||
    !/^\d+$/.test(String(id)) ||
    typeof title !== "string" ||
    typeof url !== "string"
  ) {
    return "broken";
  }

  if (title.trim() === "" || !isWebUrl(url)) {
    return "skip";
  }

  const places = (Array.isArray(jobLocation) ? jobLocation : [jobLocation])
    .map((place) => (isRecord(place) ? placeOf(place.address) : null))
    .filter((place): place is string => place !== null);

  return {
    externalId: String(id),
    title: title.trim(),
    url,
    location: joinPlaces(places, "; "),
  };
};

function placeOf(address: unknown): string | null {
  if (!isRecord(address)) {
    return null;
  }

  const part = (value: unknown) =>
    typeof value === "string" && value.trim() !== "-" ? value.trim() : "";
  const area = part(address.addressLocality) || part(address.addressRegion);

  return joinPlaces([area, part(address.addressCountry)], ", ");
}

/** Непорожні частини без повторів через `separator`, або `null`. */
function joinPlaces(parts: string[], separator: string): string | null {
  const unique = [...new Set(parts.filter((part) => part !== ""))];
  return unique.length === 0 ? null : unique.join(separator);
}

/**
 * Вакансії кар'єрного джерела на softgarden: вид джерела з адреси, один запит
 * і розбір. Адреса не softgarden - `unreadable` без жодного запиту.
 *
 * Невідомий кар'єрний сайт фід відкидає з 400 («No such client for domain»),
 * а не з 404 - тут це `not-found`, бо інших 400 у цього запиту без параметрів
 * не буває.
 */
export async function readSoftgarden(
  sourceUrl: string,
  client: HttpClient,
): Promise<ParseResult> {
  const source = softgardenSource(sourceUrl);

  if (source === null) {
    return UNREADABLE;
  }

  if (source.kind === "board") {
    const fetched = await fetchText(client, softgardenBoardUrl(source));
    return fetched.ok
      ? parseSoftgardenBoard(fetched.body, fetched.url)
      : fetched;
  }

  const fetched = await fetchJson(client, `${source.origin}/jobs.feed.json`);

  if (!fetched.ok) {
    return fetched.error.reason === "bad-status" && fetched.error.status === 400
      ? { ok: false, error: { reason: "not-found" } }
      : fetched;
  }

  return parseSoftgardenFeed(fetched.answer);
}
