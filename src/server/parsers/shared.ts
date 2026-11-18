/**
 * Дрібниці, спільні для парсерів платформ.
 */
import { HttpError, type HttpClient } from "../http/client.ts";
import type { ParseResult } from "./types.ts";

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

/**
 * Запит JSON через HTTP-клієнт: `{ ok: true, answer }` з уже розібраним тілом
 * або помилка парсера - `not-found` на 404, `bad-status` на інший не-2xx,
 * `fetch-failed` на збій запиту, `unreadable` на тіло, що не JSON.
 */
export async function fetchJson(
  client: HttpClient,
  url: string,
): Promise<
  { ok: true; answer: unknown } | Extract<ParseResult, { ok: false }>
> {
  let response;

  try {
    response = await client.get(url);
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
