/**
 * The TalentAdore parser: vacancies from the public JSON
 * `https://ats.talentadore.com/positions/{token}/json` (task 6.28).
 *
 * This JSON is what the TalentAdore widget embedded in a company career page
 * uses: the address is in the `data-url` attribute (ELK Studios). There is no
 * documentation; the format was checked with real requests on 20.11.2026: no
 * key, `{ version, company, generated_at, jobs }`, all vacancies in one request,
 * an unknown token is a 404. TalentAdore has no human-facing list page
 * (`/positions/{token}` is a 404), so the source address is the JSON itself.
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

/** The company token: letters and digits, case-sensitive (`rR1TqSR`). */
const TOKEN = /^[A-Za-z0-9_-]+$/;

/**
 * The company token from an `ats.talentadore.com/positions/{token}[/json]`
 * address, or `null`. A vacancy link (`/apply/{slug}/{token}`) carries the
 * vacancy's token, not the company's.
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

/** The board address is the JSON itself: there is no human-facing list page. */
export function talentadoreBoardUrl(token: string): string {
  return `https://${HOST}/positions/${token}/json`;
}

/**
 * Vacancies from the response: the `jobs` array. `externalId` is `id`, the title
 * is `name`, the link is `link`. The location is the city and country, and
 * without them the `location` field (at ELK, the office address).
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
 * Vacancies of a career source on TalentAdore: the token from the address, a
 * JSON request and parsing. An address without a company token is `unreadable`
 * without any request.
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
