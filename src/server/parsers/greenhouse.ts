/**
 * The Greenhouse parser: vacancies from the public Job Board API
 * (https://docs.greenhouse.io/job-board.html).
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

/**
 * The hosts where Greenhouse shows boards. The EU region is left out on purpose:
 * there is no confirmed API for it (tasks/3.06-greenhouse-parser.md).
 */
const BOARD_HOSTS = new Set([
  "job-boards.greenhouse.io",
  "boards.greenhouse.io",
]);

/**
 * The board name (board token) from a source address, or `null` if the address is
 * not a Greenhouse board. Understands the board itself (`/discord`), a vacancy
 * link (`/discord/jobs/123`) and an embedded board (`/embed/job_board?for=discord`).
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
 * Vacancies from the `GET /v1/boards/{board_token}/jobs` response.
 *
 * `externalId` is the `id` field: per the documentation it is the posting ID, the
 * same as in the vacancy link (`internal_job_id` is the ID of the job itself, and
 * it is `null` for "prospect" postings).
 *
 * A broken structure in even one record fails the whole response, bad data skips
 * that vacancy (`collectVacancies`, README "Shared format").
 */
export function parseGreenhouseJobs(answer: unknown): ParseResult {
  if (!isRecord(answer) || !Array.isArray(answer.jobs)) {
    return UNREADABLE;
  }

  return collectVacancies(answer.jobs, toVacancy);
}

const toVacancy: ReadVacancy = (job) => {
  const { id, title, absolute_url: url, location } = job;

  if (
    (typeof id !== "number" && typeof id !== "string") ||
    String(id).trim() === "" ||
    typeof title !== "string" ||
    typeof url !== "string"
  ) {
    return "broken";
  }

  if (title.trim() === "" || !isWebUrl(url)) {
    return "skip";
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
};

/**
 * Vacancies of a career source on Greenhouse: the board name from the address, a
 * Job Board API request through the HTTP client and parsing of the response. An
 * address without a Greenhouse board is `unreadable` without any request.
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
