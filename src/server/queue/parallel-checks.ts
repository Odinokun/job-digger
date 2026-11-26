/**
 * Parallel source checks: скільки джерел перевіряється одночасно
 * (src/server/http/README.md). Ліміт спільний для всіх
 * користувачів і всіх процесів - його тримає захоплення в базі (`claim.ts`).
 *
 * Задається змінною `PARALLEL_SOURCE_CHECKS` (`.env.example`). Хибне значення -
 * помилка, а не тихе значення за замовчуванням, як і в `VACANCIES_TO_CHECK`: цикл
 * черги стартує разом із сервером, тож помилка зупиняє старт, а не ховається.
 */

/** Не більше 5 джерел одночасно ([CLAUDE.md](../../../CLAUDE.md#architecture)). */
export const DEFAULT_PARALLEL_CHECKS = 5;

/** Верхня межа діапазону (1-10). */
export const MAX_PARALLEL_CHECKS = 10;

/** Значення змінної `PARALLEL_SOURCE_CHECKS`; порожня - значення за замовчуванням. */
export function parseParallelChecks(raw: string | undefined): number {
  const value = raw?.trim() ?? "";

  if (value === "") {
    return DEFAULT_PARALLEL_CHECKS;
  }

  const checks = Number(value);

  if (!/^\d+$/.test(value) || checks < 1 || checks > MAX_PARALLEL_CHECKS) {
    throw new Error(
      `PARALLEL_SOURCE_CHECKS must be a whole number from 1 to ${MAX_PARALLEL_CHECKS}, got: ${raw}`,
    );
  }

  return checks;
}
