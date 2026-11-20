/**
 * Парсер Workable: вакансії з публічного JSON віджета
 * `https://apply.workable.com/api/v1/widget/accounts/{account}` (задача 6.25).
 *
 * Офіційно задокументований API Workable (workable.readme.io) потребує ключа
 * акаунта, тож для нас закритий. Цей JSON віддає вбудований віджет вакансій
 * Workable; формат перевірено справжніми запитами 20.11.2026: без ключа, усі
 * вакансії одним запитом, невідомий акаунт - 404.
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
 * Перші сегменти шляху `apply.workable.com`, що не є акаунтом: коротке
 * посилання на вакансію (`/j/{shortcode}`) і API.
 */
const SERVICE_PATHS = new Set(["j", "api"]);

/**
 * Піддомени самої Workable, а не акаунтів старого формату
 * `{account}.workable.com`.
 */
const SERVICE_LABELS = new Set(["www", "apply", "jobs", "help", "resources"]);

/**
 * Акаунт із адреси кар'єрної сторінки чи вакансії або `null`:
 * `apply.workable.com/{account}/…` і старий формат `{account}.workable.com`.
 * Коротке посилання `apply.workable.com/j/{shortcode}` акаунта не містить.
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
 * Вакансії з відповіді віджета: об'єкт із масивом `jobs`.
 *
 * `externalId` - `shortcode` (він же в посиланні `/j/{shortcode}`), назва -
 * `title`, посилання - `url`, локація - `city` і `country`, а віддалена
 * (`telecommuting`) - з приміткою «remote».
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
 * Вакансії кар'єрного джерела на Workable: акаунт з адреси, запит віджета
 * через HTTP-клієнт і розбір. Адреса без акаунта Workable - `unreadable` без
 * жодного запиту.
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
