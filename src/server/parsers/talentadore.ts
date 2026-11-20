/**
 * Парсер TalentAdore: вакансії з публічного JSON
 * `https://ats.talentadore.com/positions/{token}/json` (задача 6.28).
 *
 * Цей JSON бере віджет TalentAdore, вбудований у кар'єрну сторінку компанії:
 * адреса стоїть в атрибуті `data-url` (ELK Studios). Документації немає;
 * формат перевірено справжніми запитами 20.11.2026: без ключа,
 * `{ version, company, generated_at, jobs }`, усі вакансії одним запитом,
 * невідомий токен - 404. Сторінки зі списком для людей у TalentAdore немає
 * (`/positions/{token}` - 404), тож адреса джерела - сам JSON.
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

const HOST = "ats.talentadore.com";

/** Токен компанії: літери й цифри, регістр важить (`rR1TqSR`). */
const TOKEN = /^[A-Za-z0-9_-]+$/;

/**
 * Токен компанії з адреси `ats.talentadore.com/positions/{token}[/json]` або
 * `null`. Посилання на вакансію (`/apply/{slug}/{token}`) несе токен
 * вакансії, а не компанії.
 */
export function talentadoreBoard(sourceUrl: string): string | null {
  let url: URL;

  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }

  if (url.hostname.toLowerCase() !== HOST) {
    return null;
  }

  const [section, token] = url.pathname.split("/").filter(Boolean);

  return section === "positions" && token !== undefined && TOKEN.test(token)
    ? token
    : null;
}

/** Адреса дошки - сам JSON: сторінки зі списком для людей немає. */
export function talentadoreBoardUrl(token: string): string {
  return `https://${HOST}/positions/${token}/json`;
}

/**
 * Вакансії з відповіді: масив `jobs`. `externalId` - `id`, назва - `name`,
 * посилання - `link`. Локація - місто й країна, а без них - поле `location`
 * (у ELK це адреса офісу).
 */
export function parseTalentAdorePositions(answer: unknown): ParseResult {
  if (!isRecord(answer) || !Array.isArray(answer.jobs)) {
    return UNREADABLE;
  }

  return collectVacancies(answer.jobs, toVacancy);
}

const toVacancy: ReadVacancy = (job) => {
  const { id, name, link } = job;

  if (
    typeof id !== "string" ||
    id.trim() === "" ||
    typeof name !== "string" ||
    typeof link !== "string"
  ) {
    return "broken";
  }

  if (name.trim() === "" || !isWebUrl(link)) {
    return "skip";
  }

  return {
    externalId: id,
    title: name.trim(),
    url: link,
    location: placeOf(job),
  };
};

function placeOf(job: Record<string, unknown>): string | null {
  const text = (value: unknown) =>
    typeof value === "string" ? value.trim() : "";
  const parts = [text(job.city), text(job.country)].filter(
    (part) => part !== "",
  );

  if (parts.length > 0) return parts.join(", ");

  const address = text(job.location);

  return address === "" ? null : address;
}

/**
 * Вакансії кар'єрного джерела на TalentAdore: токен з адреси, запит JSON і
 * розбір. Адреса без токена компанії - `unreadable` без жодного запиту.
 */
export async function readTalentAdore(
  sourceUrl: string,
  client: HttpClient,
): Promise<ParseResult> {
  const token = talentadoreBoard(sourceUrl);

  if (token === null) {
    return UNREADABLE;
  }

  const fetched = await fetchJson(client, talentadoreBoardUrl(token));

  return fetched.ok ? parseTalentAdorePositions(fetched.answer) : fetched;
}
