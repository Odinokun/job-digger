/**
 * Парсер Ashby: вакансії з публічного Job Postings API
 * (https://developers.ashbyhq.com/docs/public-job-posting-api).
 */
import { isRecord, isWebUrl, UNREADABLE } from "./shared.ts";
import type { ParsedVacancy, ParseResult } from "./types.ts";

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
 * Крива хоч одна вакансія - невдала вся відповідь (README, «Спільний формат»).
 */
export function parseAshbyJobs(answer: unknown): ParseResult {
  if (!isRecord(answer) || !Array.isArray(answer.jobs)) {
    return UNREADABLE;
  }

  const vacancies: ParsedVacancy[] = [];

  for (const item of answer.jobs) {
    if (isRecord(item) && item.isListed === false) {
      continue;
    }

    const vacancy = isRecord(item) ? toVacancy(item) : null;

    if (vacancy === null) {
      return UNREADABLE;
    }

    vacancies.push(vacancy);
  }

  return { ok: true, vacancies };
}

function toVacancy(job: Record<string, unknown>): ParsedVacancy | null {
  const { id, title, jobUrl, location, secondaryLocations } = job;

  if (
    typeof id !== "string" ||
    id.trim() === "" ||
    typeof title !== "string" ||
    title.trim() === "" ||
    typeof jobUrl !== "string" ||
    !isWebUrl(jobUrl)
  ) {
    return null;
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
}
