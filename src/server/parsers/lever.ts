/**
 * Парсер Lever: вакансії з публічного Postings API
 * (https://github.com/lever/postings-api).
 */
import type { ParsedVacancy, ParseResult } from "./types.ts";
import { isRecord, isWebUrl, UNREADABLE } from "./shared.ts";

/** Регіон Lever: від нього залежить хост API (`api.lever.co` чи `api.eu.lever.co`). */
export type LeverRegion = "global" | "eu";

/** Хости дошок Lever і їхні регіони (документація Postings API, «global / EU»). */
const BOARD_HOSTS: Record<string, LeverRegion> = {
  "jobs.lever.co": "global",
  "jobs.eu.lever.co": "eu",
};

/**
 * Сайт Lever з адреси джерела або `null`, якщо адреса - не дошка Lever. Сайт -
 * перший сегмент шляху: `jobs.lever.co/palantir`, а також посилання на
 * оголошення (`/palantir/<id>`) і на форму відгуку (`/palantir/<id>/apply`).
 */
export function leverSite(
  sourceUrl: string,
): { site: string; region: LeverRegion } | null {
  let url: URL;

  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }

  const region = BOARD_HOSTS[url.hostname];
  const [site] = url.pathname.split("/").filter(Boolean);

  return region === undefined || site === undefined ? null : { site, region };
}

/**
 * Вакансії з відповіді `GET /v0/postings/{site}?mode=json` - масиву оголошень.
 *
 * `externalId` - `id` оголошення (рядок-UUID, він же в `hostedUrl`), назва -
 * `text`, посилання - `hostedUrl`. Локація - усі з `categories.allLocations`
 * через кому (основна там теж є), а без них - `categories.location`.
 *
 * Крива хоч одна вакансія - невдала вся відповідь, як у Greenhouse
 * (README, «Спільний формат»).
 */
export function parseLeverPostings(answer: unknown): ParseResult {
  if (!Array.isArray(answer)) {
    return UNREADABLE;
  }

  const vacancies: ParsedVacancy[] = [];

  for (const item of answer) {
    const vacancy = isRecord(item) ? toVacancy(item) : null;

    if (vacancy === null) {
      return UNREADABLE;
    }

    vacancies.push(vacancy);
  }

  return { ok: true, vacancies };
}

function toVacancy(posting: Record<string, unknown>): ParsedVacancy | null {
  const { id, text, hostedUrl, categories } = posting;

  if (
    typeof id !== "string" ||
    id.trim() === "" ||
    typeof text !== "string" ||
    text.trim() === "" ||
    typeof hostedUrl !== "string" ||
    !isWebUrl(hostedUrl)
  ) {
    return null;
  }

  return {
    externalId: id,
    title: text.trim(),
    url: hostedUrl,
    location: isRecord(categories) ? locationOf(categories) : null,
  };
}

function locationOf(categories: Record<string, unknown>): string | null {
  const { allLocations, location } = categories;

  const all = Array.isArray(allLocations)
    ? allLocations
        .filter((place): place is string => typeof place === "string")
        .map((place) => place.trim())
        .filter((place) => place !== "")
    : [];

  if (all.length > 0) {
    return all.join(", ");
  }

  const primary = typeof location === "string" ? location.trim() : "";

  return primary === "" ? null : primary;
}
