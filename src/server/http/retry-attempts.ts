/**
 * Retry attempts: скільки повторів після збою мережі чи помилки сервера
 * (docs/discovery-and-parsing.md, розділ 6). Повтори робить HTTP-клієнт
 * (`client.ts`, `sendWithRetries`).
 *
 * Задається змінною `RETRY_ATTEMPTS` (`.env.example`). Хибне значення -
 * помилка, а не тихе значення за замовчуванням, як і в `PARALLEL_SOURCE_CHECKS`:
 * клієнт створюється на старті сервера, тож помилка зупиняє старт.
 */

/** Значення з плану - воно ж і верхня межа: більше не дозволяє ввічливість. */
export const DEFAULT_RETRY_ATTEMPTS = 2;

export const MAX_RETRY_ATTEMPTS = 2;

/** Значення змінної `RETRY_ATTEMPTS`; порожня - значення за замовчуванням. */
export function parseRetryAttempts(raw: string | undefined): number {
  const value = raw?.trim() ?? "";

  if (value === "") {
    return DEFAULT_RETRY_ATTEMPTS;
  }

  const attempts = Number(value);

  if (!/^\d+$/.test(value) || attempts > MAX_RETRY_ATTEMPTS) {
    throw new Error(
      `RETRY_ATTEMPTS must be a whole number from 0 to ${MAX_RETRY_ATTEMPTS}, got: ${raw}`,
    );
  }

  return attempts;
}
