/**
 * Vacancies to check: скільки вакансій щонайбільше читає з одного джерела
 * парсер, що читає список сторінками (Lever, Workday, PeopleForce, Hurma), і
 * скільки це сторінок (задачі 3.12 і 6.16).
 *
 * Ліміт у вакансіях, а не в сторінках (рішення автора 20.11.2026): сторінки в
 * платформ різні - PeopleForce по 10, Lever по 100, - і той самий ліміт у
 * сторінках давав то 50 вакансій, то 500.
 *
 * Ліміт спільний для всіх користувачів і задається змінною `VACANCIES_TO_CHECK`
 * (`.env.example`). Хибне значення - помилка, а не тихе значення за
 * замовчуванням: інакше помилку в `.env` видно було б лише з того, що вакансій
 * менше, ніж мало бути. Next завантажує серверні модулі ліниво, тож помилка
 * з'являється, коли сервер уперше бере модуль перевірки, - найпізніше на першому
 * Check now. `npm run build` її не ловить (перевірено в 3.12).
 */

/** Значення за замовчуванням - рішення автора 20.11.2026. */
export const DEFAULT_VACANCIES_TO_CHECK = 500;

/**
 * Найбільше дозволене значення - страховка від помилки в `.env`. Між
 * запитами до одного сайту пауза 2 с, тож 1000 вакансій PeopleForce - 100
 * сторінок, понад 3 хвилини на джерело; більше впиралося б у 10 хвилин, після
 * яких черга вважає завдання завислим (`src/server/queue/README.md`).
 */
export const MAX_VACANCIES_TO_CHECK = 1000;

/**
 * Скільки читати: лише першу сторінку чи до ліміту. Хто що читає -
 * `src/server/checks/README.md`, «Глибина читання».
 */
export type ReadDepth = "first-page" | "full";

/** Значення змінної `VACANCIES_TO_CHECK`; порожня - значення за замовчуванням. */
export function parseVacanciesToCheck(raw: string | undefined): number {
  const value = raw?.trim() ?? "";

  if (value === "") {
    return DEFAULT_VACANCIES_TO_CHECK;
  }

  const count = Number(value);

  if (!/^\d+$/.test(value) || count < 1 || count > MAX_VACANCIES_TO_CHECK) {
    throw new Error(
      `VACANCIES_TO_CHECK must be a whole number from 1 to ${MAX_VACANCIES_TO_CHECK}, got: ${raw}`,
    );
  }

  return count;
}

/** Ліміт застосунку. */
export const VACANCIES_TO_CHECK = parseVacanciesToCheck(
  process.env.VACANCIES_TO_CHECK,
);

/**
 * Скільки сторінок читати. Округлення вгору: ліміт 250 при сторінках по 100 -
 * три сторінки, щоб не прочитати менше, ніж обіцяє ліміт.
 */
export function pagesToRead({
  pageSize,
  depth,
  limit = VACANCIES_TO_CHECK,
}: {
  pageSize: number;
  depth: ReadDepth;
  limit?: number;
}): number {
  return depth === "first-page" ? 1 : Math.ceil(limit / pageSize);
}
