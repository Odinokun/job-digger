/**
 * Дрібниці, спільні для парсерів платформ.
 */
import type { ParseResult } from "./types.ts";

/** Відповідь не того формату - зокрема коли крива хоч одна вакансія. */
export const UNREADABLE: ParseResult = {
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
