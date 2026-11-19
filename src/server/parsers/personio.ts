/**
 * Парсер Personio: вакансії з публічного XML-фіду дошки
 * `https://{company}.jobs.personio.de/xml` (задача 3.27).
 *
 * Фід задокументований (developer.personio.de/docs/retrieving-open-job-positions):
 * корінь `<workzag-jobs>`, вакансія - `<position>`, посилання на вакансію -
 * `/job/{id}`. Чого документація не каже, перевірено справжніми запитами
 * 19.11.2026: без ключа, усі вакансії одним документом, невідома дошка - 404.
 */
import * as cheerio from "cheerio";

import type { HttpClient } from "../http/client.ts";
import {
  collectVacancies,
  fetchText,
  UNREADABLE,
  type ReadVacancy,
} from "./shared.ts";
import type { ParseResult } from "./types.ts";

/**
 * Домени дошок. `.com` віддає те саме, що `.de` (перевірено на Astrafy), тож
 * дошка лишається на тому домені, який дав користувач.
 */
const DOMAINS = ["jobs.personio.de", "jobs.personio.com"];

/**
 * Дошка з адреси дошки, фіду чи вакансії (`acme.jobs.personio.de/job/7` →
 * `https://acme.jobs.personio.de`) або `null`, якщо це не дошка Personio.
 * `www` - сайт самої Personio, а не компанія.
 */
export function personioBoard(sourceUrl: string): string | null {
  let host: string;

  try {
    host = new URL(sourceUrl).hostname.toLowerCase();
  } catch {
    return null;
  }

  const domain = DOMAINS.find((suffix) => host.endsWith(`.${suffix}`));

  if (domain === undefined) {
    return null;
  }

  const company = host.slice(0, -domain.length - 1);

  return company.includes(".") || company === "www"
    ? null
    : `https://${company}.${domain}`;
}

/**
 * Вакансії з XML-фіду. `board` - адреса дошки, від неї складається посилання
 * на вакансію `/job/{id}`, як у прикладі документації.
 *
 * `externalId` - `id` (лише цифри), назва - `name`, локація - `office` і за
 * ним `additionalOffices` через кому, без повторів.
 */
export function parsePersonioFeed(xml: string, board: string): ParseResult {
  const $ = cheerio.load(xml, { xml: true });
  const root = $.root().children("workzag-jobs");

  if (root.length !== 1) {
    return UNREADABLE;
  }

  const positions = root
    .children("position")
    .toArray()
    .map((element) => {
      const position = $(element);
      // Лише прямі нащадки: у блоків опису (`jobDescription`) теж є `<name>`.
      const field = (name: string) => {
        const found = position.children(name);
        return found.length === 0 ? null : found.first().text();
      };

      return {
        id: field("id"),
        name: field("name"),
        offices: [
          field("office"),
          ...position
            .children("additionalOffices")
            .children("office")
            .toArray()
            .map((office) => $(office).text()),
        ],
      };
    });

  return collectVacancies(positions, vacancyOn(board));
}

/** Читач позиції фіду; посилання на вакансію складається від `board`. */
const vacancyOn =
  (board: string): ReadVacancy =>
  (position) => {
    const { id, name, offices } = position;

    if (
      typeof id !== "string" ||
      !/^\d+$/.test(id.trim()) ||
      typeof name !== "string"
    ) {
      return "broken";
    }

    if (name.trim() === "") {
      return "skip";
    }

    return {
      externalId: id.trim(),
      title: name.trim(),
      url: `${board}/job/${id.trim()}`,
      location: placeOf(offices),
    };
  };

function placeOf(offices: unknown): string | null {
  const places = (Array.isArray(offices) ? offices : [])
    .filter((office): office is string => typeof office === "string")
    .map((office) => office.trim())
    .filter((office) => office !== "");
  const unique = [...new Set(places)];

  return unique.length === 0 ? null : unique.join(", ");
}

/**
 * Вакансії кар'єрного джерела на Personio: дошка з адреси, запит `/xml` через
 * HTTP-клієнт і розбір. Адреса без дошки Personio - `unreadable` без жодного
 * запиту.
 */
export async function readPersonio(
  sourceUrl: string,
  client: HttpClient,
): Promise<ParseResult> {
  const board = personioBoard(sourceUrl);

  if (board === null) {
    return UNREADABLE;
  }

  const fetched = await fetchText(client, `${board}/xml`);

  return fetched.ok ? parsePersonioFeed(fetched.body, board) : fetched;
}
