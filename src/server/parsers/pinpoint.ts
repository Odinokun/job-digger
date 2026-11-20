/**
 * Парсер Pinpoint: вакансії з публічного JSON кар'єрної сторінки
 * `https://{company}.pinpointhq.com/postings.json` (задача 6.27).
 *
 * Документації в цього JSON ми не знайшли; формат перевірено справжніми
 * запитами 20.11.2026: без ключа, `{ data: [...] }`, усі вакансії одним
 * запитом, разом із повними описами (у GiG - 100 КБ на 16 вакансій), невідома
 * компанія - 404.
 */
import type { HttpClient } from "../http/client.ts";
import {
  collectVacancies,
  fetchJson,
  isRecord,
  isWebUrl,
  UNREADABLE,
  type ReadVacancy,
} from "./shared.ts";
import type { ParseResult } from "./types.ts";

const DOMAIN = "pinpointhq.com";

/** Піддомени самої Pinpoint: сайт, застосунок і файли (`app.pinpointhq.com`). */
const SERVICE_LABELS = new Set(["www", "app", "api", "help", "developers"]);

/**
 * Компанія з адреси кар'єрної сторінки чи вакансії
 * (`gig.pinpointhq.com/en/postings/…` → `gig`) або `null`.
 */
export function pinpointCompany(sourceUrl: string): string | null {
  let host: string;

  try {
    host = new URL(sourceUrl).hostname.toLowerCase();
  } catch {
    return null;
  }

  if (!host.endsWith(`.${DOMAIN}`)) {
    return null;
  }

  const company = host.slice(0, -DOMAIN.length - 1);

  return company.includes(".") || SERVICE_LABELS.has(company) ? null : company;
}

/**
 * Вакансії з відповіді `postings.json`: масив `data`.
 *
 * `externalId` - `id`, назва - `title`, посилання - `url`. Локація - місто й
 * регіон (`location.city`, `location.province`) без повторів, з приміткою
 * «remote» для `workplace_type: "remote"`. Одна позиція в кількох містах -
 * кілька вакансій з різними `id`, як і на сторінці Pinpoint.
 */
export function parsePinpointPostings(answer: unknown): ParseResult {
  if (!isRecord(answer) || !Array.isArray(answer.data)) {
    return UNREADABLE;
  }

  return collectVacancies(answer.data, toVacancy);
}

const toVacancy: ReadVacancy = (posting) => {
  const { id, title, url } = posting;

  if (
    typeof id !== "string" ||
    id.trim() === "" ||
    typeof title !== "string" ||
    typeof url !== "string"
  ) {
    return "broken";
  }

  if (title.trim() === "" || !isWebUrl(url)) {
    return "skip";
  }

  return {
    externalId: id,
    title: title.trim(),
    url,
    location: placeOf(posting),
  };
};

function placeOf(posting: Record<string, unknown>): string | null {
  const location = isRecord(posting.location) ? posting.location : {};
  const parts: string[] = [];

  for (const part of [location.city, location.province]) {
    const text = typeof part === "string" ? part.trim() : "";
    const seen = parts.some(
      (known) => known.toLowerCase() === text.toLowerCase(),
    );
    if (text !== "" && !seen) parts.push(text);
  }

  if (posting.workplace_type === "remote") parts.push("remote");

  return parts.length === 0 ? null : parts.join(", ");
}

/**
 * Вакансії кар'єрного джерела на Pinpoint: компанія з адреси, запит
 * `postings.json` і розбір. Адреса без компанії - `unreadable` без запиту.
 */
export async function readPinpoint(
  sourceUrl: string,
  client: HttpClient,
): Promise<ParseResult> {
  const company = pinpointCompany(sourceUrl);

  if (company === null) {
    return UNREADABLE;
  }

  const fetched = await fetchJson(
    client,
    `https://${company}.${DOMAIN}/postings.json`,
  );

  return fetched.ok ? parsePinpointPostings(fetched.answer) : fetched;
}
