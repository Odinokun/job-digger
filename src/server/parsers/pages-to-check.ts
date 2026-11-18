/**
 * Pages to check: скільки сторінок списку читає парсер з одного джерела
 * (docs/discovery-and-parsing.md, розділ 6). Досягнення ліміту - нормальне
 * завершення, перевірка успішна.
 *
 * Ліміт спільний для всіх користувачів і задається змінною `PAGES_TO_CHECK`
 * (`.env.example`). Хибне значення - помилка, а не тихе значення за
 * замовчуванням: інакше помилку в `.env` видно було б лише з того, що вакансій
 * менше, ніж мало бути. Next завантажує серверні модулі ліниво, тож помилка
 * з'являється, коли сервер уперше бере модуль перевірки, - найпізніше на першому
 * Check now. `npm run build` її не ловить (перевірено).
 */

/** Значення з плану. */
export const DEFAULT_PAGES_TO_CHECK = 5;

/**
 * Найбільше дозволене значення - страховка від помилки в `.env`, а не
 * обмеження платформ. Між запитами до одного сайту пауза 2 с, тож 100 сторінок -
 * понад 3 хвилини на одне джерело.
 */
export const MAX_PAGES_TO_CHECK = 100;

/** Значення змінної `PAGES_TO_CHECK`; порожня - значення за замовчуванням. */
export function parsePagesToCheck(raw: string | undefined): number {
  const value = raw?.trim() ?? "";

  if (value === "") {
    return DEFAULT_PAGES_TO_CHECK;
  }

  const pages = Number(value);

  if (!/^\d+$/.test(value) || pages < 1 || pages > MAX_PAGES_TO_CHECK) {
    throw new Error(
      `PAGES_TO_CHECK must be a whole number from 1 to ${MAX_PAGES_TO_CHECK}, got: ${raw}`,
    );
  }

  return pages;
}

/** Ліміт застосунку. */
export const PAGES_TO_CHECK = parsePagesToCheck(process.env.PAGES_TO_CHECK);
