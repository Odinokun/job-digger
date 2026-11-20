/**
 * Парсер BambooHR: вакансії з публічного JSON кар'єрної сторінки
 * `https://{company}.bamboohr.com/careers/list` (задача 6.26).
 *
 * Документований API BambooHR потребує ключа компанії. Цей JSON бере сама
 * кар'єрна сторінка й вбудований віджет; формат перевірено справжніми запитами
 * 20.11.2026: без ключа, `{ meta: { totalCount }, result: [...] }`, усі вакансії
 * одним запитом. Невідома компанія - не 404, а редирект на сайт BambooHR.
 */
import type { HttpClient } from "../http/client.ts";
import {
  collectVacancies,
  fetchText,
  isRecord,
  UNREADABLE,
  type ReadVacancy,
} from "./shared.ts";
import type { ParsedVacancy, ParseResult } from "./types.ts";

const DOMAIN = "bamboohr.com";

/** Піддомени самої BambooHR, а не компаній. */
const SERVICE_LABELS = new Set(["www", "api", "app", "help", "marketplace"]);

/**
 * Компанія з адреси кар'єрної сторінки чи вакансії
 * (`altenar.bamboohr.com/careers/88` → `altenar`) або `null`.
 */
export function bamboohrCompany(sourceUrl: string): string | null {
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
 * Вакансії з відповіді `/careers/list`: масив `result`.
 *
 * `externalId` - `id`, назва - `jobOpeningName`. Посилання в JSON немає -
 * сторінка вакансії `/careers/{id}` (відповідає 200, перевірено). Локація -
 * `location` (місто, регіон), а якщо воно порожнє - `atsLocation`. Поле
 * `locationType` («0», «1») не задокументоване, тож «remote» з нього не
 * вигадуємо.
 */
export function parseBambooHrList(
  answer: unknown,
  company: string,
): ParseResult {
  if (!isRecord(answer) || !Array.isArray(answer.result)) {
    return UNREADABLE;
  }

  return collectVacancies(answer.result, vacancyOf(company));
}

function vacancyOf(company: string): ReadVacancy {
  return (job) => {
    const { id, jobOpeningName } = job;

    if (
      typeof id !== "string" ||
      id.trim() === "" ||
      typeof jobOpeningName !== "string"
    ) {
      return "broken";
    }

    if (jobOpeningName.trim() === "") {
      return "skip";
    }

    const vacancy: ParsedVacancy = {
      externalId: id,
      title: jobOpeningName.trim(),
      url: `https://${company}.${DOMAIN}/careers/${encodeURIComponent(id)}`,
      location: placeOf(job.location) ?? placeOf(job.atsLocation),
    };

    return vacancy;
  };
}

function placeOf(location: unknown): string | null {
  if (!isRecord(location)) {
    return null;
  }

  const parts = [
    location.city,
    location.state,
    location.province,
    location.country,
  ]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part !== "");

  return parts.length === 0 ? null : parts.join(", ");
}

/**
 * Вакансії кар'єрного джерела на BambooHR: компанія з адреси, запит
 * `/careers/list` і розбір. Невідому компанію BambooHR переадресовує на свій
 * сайт - це `not-found`, а не `unreadable`. Адреса без компанії - `unreadable`
 * без жодного запиту.
 */
export async function readBambooHr(
  sourceUrl: string,
  client: HttpClient,
): Promise<ParseResult> {
  const company = bamboohrCompany(sourceUrl);

  if (company === null) {
    return UNREADABLE;
  }

  const host = `${company}.${DOMAIN}`;
  const page = await fetchText(client, `https://${host}/careers/list`);

  if (!page.ok) {
    return page;
  }

  if (new URL(page.url).hostname.toLowerCase() !== host) {
    return { ok: false, error: { reason: "not-found" } };
  }

  let answer: unknown;
  try {
    answer = JSON.parse(page.body);
  } catch {
    return UNREADABLE;
  }

  return parseBambooHrList(answer, company);
}
