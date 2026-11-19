/**
 * Парсер Breezy HR: вакансії з публічного JSON дошки
 * `https://{company}.breezy.hr/json` (задача 3.24).
 *
 * Офіційної документації в цього JSON немає - його описують лише сторонні
 * скрапери. Формат перевірено справжніми запитами 19.11.2026: без ключа, масив
 * вакансій одним запитом, без сторінок; невідома дошка - 404.
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

const DOMAIN = "breezy.hr";

/**
 * Піддомени самої Breezy, а не компаній: скрипти й стилі вбудованої дошки
 * (`assets-cdn`), застосунок рекрутера (`app`) і сайт (`www`). `jobs` - дошка
 * самої Breezy, тож вона компанія, як будь-яка інша.
 */
const SERVICE_LABELS = new Set(["www", "app", "assets-cdn"]);

/**
 * Компанія з адреси дошки чи вакансії (`acme.breezy.hr/p/...` → `acme`) або
 * `null`, якщо це не дошка Breezy.
 */
export function breezyCompany(sourceUrl: string): string | null {
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
 * Вакансії з відповіді `/json`: масив вакансій.
 *
 * `externalId` - поле `id` (він же на початку шляху `/p/{id}-{slug}`), назва -
 * `name`, посилання - `url`, локація - `location.name`, а для віддаленої
 * вакансії (`location.is_remote`) з приміткою «remote».
 */
export function parseBreezyPositions(answer: unknown): ParseResult {
  if (!Array.isArray(answer)) {
    return UNREADABLE;
  }

  return collectVacancies(answer, toVacancy);
}

const toVacancy: ReadVacancy = (position) => {
  const { id, name, url, location } = position;

  if (
    typeof id !== "string" ||
    id.trim() === "" ||
    typeof name !== "string" ||
    typeof url !== "string"
  ) {
    return "broken";
  }

  if (name.trim() === "" || !isWebUrl(url)) {
    return "skip";
  }

  return {
    externalId: id,
    title: name.trim(),
    url,
    location: placeOf(location),
  };
};

function placeOf(location: unknown): string | null {
  if (!isRecord(location)) {
    return null;
  }

  const name = typeof location.name === "string" ? location.name.trim() : "";
  const remote = location.is_remote === true;

  if (name === "") {
    return remote ? "remote" : null;
  }

  return remote ? `${name}, remote` : name;
}

/**
 * Вакансії кар'єрного джерела на Breezy HR: компанія з адреси, запит `/json`
 * через HTTP-клієнт і розбір. Адреса без дошки Breezy - `unreadable` без
 * жодного запиту.
 */
export async function readBreezy(
  sourceUrl: string,
  client: HttpClient,
): Promise<ParseResult> {
  const company = breezyCompany(sourceUrl);

  if (company === null) {
    return UNREADABLE;
  }

  const fetched = await fetchJson(client, `https://${company}.${DOMAIN}/json`);

  return fetched.ok ? parseBreezyPositions(fetched.answer) : fetched;
}
