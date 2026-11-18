/**
 * Парсер Ashby: вакансії з публічного Job Postings API
 * (https://developers.ashbyhq.com/docs/public-job-posting-api).
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

/** Хост дошок Ashby. */
const BOARD_HOST = "jobs.ashbyhq.com";

/**
 * Назва дошки Ashby з адреси джерела або `null`, якщо адреса - не дошка Ashby.
 * Назва - перший сегмент шляху: сама дошка (`jobs.ashbyhq.com/linear`),
 * вакансія чи форма відгуку (`/linear/<id>/application`), вбудована дошка
 * (`/linear/embed`).
 */
export function ashbyBoard(sourceUrl: string): string | null {
  let url: URL;

  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }

  if (url.hostname !== BOARD_HOST) {
    return null;
  }

  const [board] = url.pathname.split("/").filter(Boolean);

  return board ?? null;
}

/**
 * Вакансії з відповіді `GET /posting-api/job-board/{name}` - обʼєкта з `jobs`.
 *
 * `externalId` - `id` (UUID, він же в `jobUrl`; документація поле не описує, але
 * API його віддає - перевірено 18.11.2026), назва - `title`, посилання -
 * `jobUrl`, локація - `location` і після неї `secondaryLocations` через кому.
 * Вакансія з `isListed: false` пропускається: вона доступна лише за прямим
 * посиланням, на дошці компанії її не видно.
 *
 * Зламана структура - невдала вся відповідь, вада даних - пропуск вакансії
 * (`collectVacancies`, README «Спільний формат»). Невидима вакансія - не вада:
 * у `skipped` вона не рахується.
 */
export function parseAshbyJobs(answer: unknown): ParseResult {
  if (!isRecord(answer) || !Array.isArray(answer.jobs)) {
    return UNREADABLE;
  }

  const listed = answer.jobs.filter(
    (item) => !(isRecord(item) && item.isListed === false),
  );

  return collectVacancies(listed, toVacancy);
}

const toVacancy: ReadVacancy = (job) => {
  const { id, title, jobUrl, location, secondaryLocations } = job;

  if (
    typeof id !== "string" ||
    id.trim() === "" ||
    typeof title !== "string" ||
    typeof jobUrl !== "string"
  ) {
    return "broken";
  }

  if (title.trim() === "" || !isWebUrl(jobUrl)) {
    return "skip";
  }

  const places = [
    location,
    ...(Array.isArray(secondaryLocations)
      ? secondaryLocations.map((place) =>
          isRecord(place) ? place.location : null,
        )
      : []),
  ]
    .filter((place): place is string => typeof place === "string")
    .map((place) => place.trim())
    .filter((place) => place !== "");

  return {
    externalId: id,
    title: title.trim(),
    url: jobUrl,
    location: places.length === 0 ? null : places.join(", "),
  };
};

/**
 * Ліміт розміру відповіді API Ashby. Ashby віддає всі вакансії дошки разом з
 * описами одним запитом, без сторінок і без способу прибрати описи: OpenAI
 * (839 вакансій) - 14 МБ, сама Ashby (77) - 4,4 МБ (перевірено 18.11.2026),
 * а спільний ліміт клієнта - 5 МБ. 30 МБ - із запасом понад відомі дошки й лише
 * для цього API, довільні сайти лишаються з 5 МБ (рішення автора 18.11.2026).
 */
export const ASHBY_MAX_BYTES = 30 * 1024 * 1024;

/**
 * Вакансії кар'єрного джерела на Ashby: назва дошки з адреси, один запит до
 * Job Postings API і розбір. Адреса без дошки Ashby - `unreadable` без запиту.
 */
export async function readAshby(
  sourceUrl: string,
  client: HttpClient,
): Promise<ParseResult> {
  const board = ashbyBoard(sourceUrl);

  if (board === null) {
    return UNREADABLE;
  }

  const fetched = await fetchJson(
    client,
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}`,
    { maxBytes: ASHBY_MAX_BYTES },
  );

  return fetched.ok ? parseAshbyJobs(fetched.answer) : fetched;
}
