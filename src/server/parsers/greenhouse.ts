/**
 * Парсер Greenhouse: вакансії з публічного Job Board API
 * (https://docs.greenhouse.io/job-board.html).
 */
import type { HttpClient } from "../http/client.ts";
import { fetchJson, isRecord, isWebUrl, UNREADABLE } from "./shared.ts";
import type { ParsedVacancy, ParseResult } from "./types.ts";

/**
 * Хости, на яких Greenhouse показує дошки. Регіону ЄС тут немає свідомо:
 * підтвердженого API для нього немає (tasks/3.06-greenhouse-parser.md).
 */
const BOARD_HOSTS = new Set([
  "job-boards.greenhouse.io",
  "boards.greenhouse.io",
]);

/**
 * Назва дошки (board token) з адреси джерела або `null`, якщо адреса - не
 * дошка Greenhouse. Розуміє саму дошку (`/discord`), посилання на вакансію
 * (`/discord/jobs/123`) і вбудовану дошку (`/embed/job_board?for=discord`).
 */
export function greenhouseBoardToken(sourceUrl: string): string | null {
  let url: URL;

  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }

  if (!BOARD_HOSTS.has(url.hostname)) {
    return null;
  }

  const [first] = url.pathname.split("/").filter(Boolean);

  if (first === "embed") {
    return url.searchParams.get("for") || null;
  }

  return first ?? null;
}

/**
 * Вакансії з відповіді `GET /v1/boards/{board_token}/jobs`.
 *
 * `externalId` - поле `id`: за документацією це ID оголошення, той самий, що в
 * посиланні на вакансію (`internal_job_id` - ID самої посади, в оголошень-
 * «prospect» він `null`).
 *
 * Крива хоч одна вакансія - невдала вся відповідь, а не пропуск цієї вакансії:
 * якби змінився формат, пропущеними виявились би всі, і порожній список закрив
 * би всі вакансії джерела. Невдала перевірка вакансій не чіпає.
 */
export function parseGreenhouseJobs(answer: unknown): ParseResult {
  if (!isRecord(answer) || !Array.isArray(answer.jobs)) {
    return UNREADABLE;
  }

  const vacancies: ParsedVacancy[] = [];

  for (const job of answer.jobs) {
    const vacancy = isRecord(job) ? toVacancy(job) : null;

    if (vacancy === null) {
      return UNREADABLE;
    }

    vacancies.push(vacancy);
  }

  return { ok: true, vacancies };
}

function toVacancy(job: Record<string, unknown>): ParsedVacancy | null {
  const { id, title, absolute_url: url, location } = job;

  if (
    (typeof id !== "number" && typeof id !== "string") ||
    typeof title !== "string" ||
    title.trim() === "" ||
    typeof url !== "string" ||
    !isWebUrl(url)
  ) {
    return null;
  }

  const place =
    isRecord(location) && typeof location.name === "string"
      ? location.name.trim()
      : "";

  return {
    externalId: String(id),
    title: title.trim(),
    url,
    location: place === "" ? null : place,
  };
}

/**
 * Вакансії кар'єрного джерела на Greenhouse: назва дошки з адреси, запит до
 * Job Board API через HTTP-клієнт і розбір відповіді. Адреса, у якій немає
 * дошки Greenhouse, - `unreadable` без жодного запиту.
 */
export async function readGreenhouse(
  sourceUrl: string,
  client: HttpClient,
): Promise<ParseResult> {
  const board = greenhouseBoardToken(sourceUrl);

  if (board === null) {
    return UNREADABLE;
  }

  const fetched = await fetchJson(
    client,
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs`,
  );

  return fetched.ok ? parseGreenhouseJobs(fetched.answer) : fetched;
}
