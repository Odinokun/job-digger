/**
 * Дрібниці, спільні для парсерів платформ.
 */
import {
  HttpError,
  type HttpClient,
  type HttpResponse,
  type RequestOptions,
} from "../http/client.ts";
import type { ParsedVacancy, ParseResult } from "./types.ts";

/** Відповідь не того формату - зокрема коли крива хоч одна вакансія. */
export const UNREADABLE: Extract<ParseResult, { ok: false }> = {
  ok: false,
  error: { reason: "unreadable" },
};

/** Лише http і https: посилання з іншою схемою (`javascript:`) у UI - діра. */
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
 * Запит JSON через HTTP-клієнт: `{ ok: true, answer }` з уже розібраним тілом
 * або помилка парсера - `not-found` на 404, `bad-status` на інший не-2xx,
 * `fetch-failed` на збій запиту, `unreadable` на тіло, що не JSON. `request` -
 * налаштування запиту для клієнта, зокрема власний ліміт розміру.
 */
export function fetchJson(
  client: HttpClient,
  url: string,
  request?: RequestOptions,
): Promise<FetchedJson> {
  return answerOf(() => client.get(url, request));
}

/** Те саме, що `fetchJson`, але POST з тілом JSON (Workday). */
export function postJson(
  client: HttpClient,
  url: string,
  json: unknown,
): Promise<FetchedJson> {
  return answerOf(() => client.post(url, json));
}

async function answerOf(
  send: () => Promise<HttpResponse>,
): Promise<FetchedJson> {
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

  try {
    return { ok: true, answer: JSON.parse(response.body) };
  } catch {
    return UNREADABLE;
  }
}

/**
 * Що читач платформи зробив з одним записом: вакансія, `"skip"` - вада даних
 * (порожня назва, адреса не http(s)), `"broken"` - зламана структура (id чи
 * назва не того типу).
 */
export type ReadVacancy = (
  item: Record<string, unknown>,
) => ParsedVacancy | "skip" | "broken";

/**
 * Вакансії зі списку записів платформи (docs/discovery-and-parsing.md,
 * розділ 6, «Довіряємо лише цілим відповідям»):
 *
 * - зламана структура хоч одного запису - невдала вся відповідь: це сигнал
 *   зміни формату, і якби такі записи пропускалися, пропущеними виявились би
 *   всі, а порожній список видалив би всі вакансії джерела;
 * - вада даних - запис пропускається й рахується в `skipped`;
 * - пропущені всі записи непорожнього списку - теж невдала відповідь: нуль
 *   вакансій через криві дані - не «вакансій немає».
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
