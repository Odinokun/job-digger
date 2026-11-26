/**
 * The Ashby parser: vacancies from the public Job Postings API
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

/** The Ashby board host. */
const BOARD_HOST = "jobs.ashbyhq.com";

/**
 * The Ashby board name from a source address, or `null` if the address is not an
 * Ashby board. The name is the first path segment: the board itself
 * (`jobs.ashbyhq.com/linear`), a vacancy or an application form
 * (`/linear/<id>/application`), an embedded board (`/linear/embed`).
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
 * Vacancies from the `GET /posting-api/job-board/{name}` response - an object
 * with `jobs`.
 *
 * `externalId` is `id` (a UUID, the same as in `jobUrl`; the documentation does
 * not describe the field, but the API returns it - checked 18.11.2026), the title
 * is `title`, the link is `jobUrl`, the location is `location` followed by
 * `secondaryLocations`, comma-separated. A vacancy with `isListed: false` is
 * skipped: it is reachable only by a direct link and not visible on the company board.
 *
 * A broken structure fails the whole response, bad data skips the vacancy
 * (`collectVacancies`, README "Shared format"). An unlisted vacancy is not bad
 * data: it is not counted in `skipped`.
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
 * The Ashby API response size limit. Ashby returns all of a board's vacancies
 * with descriptions in one request, without pages and without a way to drop the
 * descriptions: OpenAI (839 vacancies) is 14 MB, Ashby itself (77) 4.4 MB
 * (checked 18.11.2026), while the client's shared limit is 5 MB. 30 MB leaves a
 * margin over the known boards and applies only to this API; arbitrary sites
 * keep 5 MB (the author's decision of 18.11.2026).
 */
export const ASHBY_MAX_BYTES = 30 * 1024 * 1024;

/**
 * Vacancies of a career source on Ashby: the board name from the address, one
 * Job Postings API request and parsing. An address without an Ashby board is
 * `unreadable` without a request.
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
