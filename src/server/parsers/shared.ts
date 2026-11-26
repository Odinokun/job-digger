/**
 * Small helpers shared by the platform parsers.
 */
import {
  HttpError,
  type HttpClient,
  type HttpResponse,
  type RequestOptions,
} from "../http/client.ts";
import type { ParsedVacancy, ParseResult } from "./types.ts";

/** A response of the wrong format - including when even one vacancy is broken. */
export const UNREADABLE: Extract<ParseResult, { ok: false }> = {
  ok: false,
  error: { reason: "unreadable" },
};

/** Only http and https: a link with another scheme (`javascript:`) is a hole in the UI. */
export function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type FetchedJson =
  { ok: true; answer: unknown } | Extract<ParseResult, { ok: false }>;

/**
 * A JSON request through the HTTP client: `{ ok: true, answer }` with the body
 * already parsed, or a parser error - `not-found` on a 404, `bad-status` on
 * another non-2xx, `fetch-failed` on a failed request, `unreadable` on a body
 * that is not JSON. `request` holds the request settings for the client,
 * including its own size limit.
 */
export function fetchJson(
  client: HttpClient,
  url: string,
  request?: RequestOptions,
): Promise<FetchedJson> {
  return answerOf(() => client.get(url, request));
}

/** The same as `fetchJson`, but a POST with a JSON body (Workday). */
export function postJson(
  client: HttpClient,
  url: string,
  json: unknown,
): Promise<FetchedJson> {
  return answerOf(() => client.post(url, json));
}

/**
 * A page through the HTTP client: `{ ok: true, body, url }` - the body as it is,
 * for HTML, and the address it came from after redirects (relative links
 * resolve against it) - or the same errors as in `fetchJson`, except JSON
 * parsing.
 */
export async function fetchText(
  client: HttpClient,
  url: string,
): Promise<
  { ok: true; body: string; url: string } | Extract<ParseResult, { ok: false }>
> {
  const sent = await responseOf(() => client.get(url));

  return sent.ok
    ? { ok: true, body: sent.response.body, url: sent.response.url }
    : sent;
}

async function answerOf(
  send: () => Promise<HttpResponse>,
): Promise<FetchedJson> {
  const sent = await responseOf(send);

  if (!sent.ok) {
    return sent;
  }

  try {
    return { ok: true, answer: JSON.parse(sent.response.body) };
  } catch {
    return UNREADABLE;
  }
}

/** A 2xx response, or a parser error by status or by request failure. */
async function responseOf(
  send: () => Promise<HttpResponse>,
): Promise<
  { ok: true; response: HttpResponse } | Extract<ParseResult, { ok: false }>
> {
  let response;

  try {
    response = await send();
  } catch (error) {
    if (error instanceof HttpError) {
      return {
        ok: false,
        error: { reason: "fetch-failed", cause: error.reason },
      };
    }
    throw error;
  }

  if (response.status === 404) {
    return { ok: false, error: { reason: "not-found" } };
  }

  if (response.status < 200 || response.status >= 300) {
    return {
      ok: false,
      error: { reason: "bad-status", status: response.status },
    };
  }

  return { ok: true, response };
}

/**
 * What a platform reader did with one record: a vacancy, `"skip"` - bad data
 * (an empty title, a non-http(s) address), `"broken"` - a broken structure (an id
 * or title of the wrong type).
 */
export type ReadVacancy = (
  item: Record<string, unknown>,
) => ParsedVacancy | "skip" | "broken";

/**
 * Vacancies from a platform's list of records (src/server/parsers/README.md, "Shared format"):
 *
 * - a broken structure in even one record fails the whole response: it signals a
 *   format change, and if such records were skipped, all of them would be, and
 *   an empty list would delete all the source's vacancies;
 * - bad data skips the record and counts it in `skipped`;
 * - all records of a non-empty list skipped also fails the response: zero
 *   vacancies because of bad data is not "there are no vacancies".
 */
export function collectVacancies(
  items: unknown[],
  read: ReadVacancy,
): ParseResult {
  const vacancies: ParsedVacancy[] = [];
  let skipped = 0;

  for (const item of items) {
    const result = isRecord(item) ? read(item) : "broken";

    if (result === "broken") {
      return UNREADABLE;
    }

    if (result === "skip") {
      skipped += 1;
      continue;
    }

    vacancies.push(result);
  }

  if (vacancies.length === 0 && skipped > 0) {
    return UNREADABLE;
  }

  return { ok: true, vacancies, skipped };
}
