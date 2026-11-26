/**
 * The Workable parser: vacancies from the public widget JSON
 * `https://apply.workable.com/api/v1/widget/accounts/{account}` (task 6.25).
 *
 * Workable's officially documented API (workable.readme.io) needs an account
 * key, so it is closed to us. This JSON is served to Workable's embedded
 * vacancy widget; the format was checked with real requests on 20.11.2026: no
 * key, all vacancies in one request, an unknown account is a 404.
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

const DOMAIN = "workable.com";
const CAREERS_HOST = `apply.${DOMAIN}`;

/**
 * First path segments of `apply.workable.com` that are not an account: the short
 * vacancy link (`/j/{shortcode}`) and the API.
 */
const SERVICE_PATHS = new Set(["j", "api"]);

/**
 * Subdomains of Workable itself, not accounts of the old
 * `{account}.workable.com` format.
 */
const SERVICE_LABELS = new Set(["www", "apply", "jobs", "help", "resources"]);

/**
 * The account from a career page or vacancy address, or `null`:
 * `apply.workable.com/{account}/…` and the old `{account}.workable.com` format.
 * The short link `apply.workable.com/j/{shortcode}` has no account in it.
 */
export function workableAccount(sourceUrl: string): string | null {
  let url: URL;

  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();

  if (host === CAREERS_HOST) {
    const first = url.pathname.split("/").find((segment) => segment !== "");
    const account = first?.toLowerCase();

    return account === undefined || SERVICE_PATHS.has(account) ? null : account;
  }

  if (!host.endsWith(`.${DOMAIN}`)) {
    return null;
  }

  const account = host.slice(0, -DOMAIN.length - 1);

  return account.includes(".") || SERVICE_LABELS.has(account) ? null : account;
}

/**
 * Vacancies from the widget response: an object with a `jobs` array.
 *
 * `externalId` is `shortcode` (the same as in the `/j/{shortcode}` link), the
 * title is `title`, the link is `url`, the location is `city` and `country`, and
 * a remote one (`telecommuting`) gets a "remote" note.
 */
export function parseWorkableWidget(answer: unknown): ParseResult {
  if (!isRecord(answer) || !Array.isArray(answer.jobs)) {
    return UNREADABLE;
  }

  return collectVacancies(answer.jobs, toVacancy);
}

const toVacancy: ReadVacancy = (job) => {
  const { shortcode, title, url } = job;

  if (
    typeof shortcode !== "string" ||
    shortcode.trim() === "" ||
    typeof title !== "string" ||
    typeof url !== "string"
  ) {
    return "broken";
  }

  if (title.trim() === "" || !isWebUrl(url)) {
    return "skip";
  }

  return {
    externalId: shortcode,
    title: title.trim(),
    url,
    location: placeOf(job),
  };
};

function placeOf(job: Record<string, unknown>): string | null {
  const parts = [job.city, job.country]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part !== "");
  const remote = job.telecommuting === true;

  if (parts.length === 0) {
    return remote ? "remote" : null;
  }

  return remote ? `${parts.join(", ")}, remote` : parts.join(", ");
}

/**
 * Vacancies of a career source on Workable: the account from the address, a
 * widget request through the HTTP client and parsing. An address without a
 * Workable account is `unreadable` without any request.
 */
export async function readWorkable(
  sourceUrl: string,
  client: HttpClient,
): Promise<ParseResult> {
  const account = workableAccount(sourceUrl);

  if (account === null) {
    return UNREADABLE;
  }

  const fetched = await fetchJson(
    client,
    `https://${CAREERS_HOST}/api/v1/widget/accounts/${account}`,
  );

  return fetched.ok ? parseWorkableWidget(fetched.answer) : fetched;
}
