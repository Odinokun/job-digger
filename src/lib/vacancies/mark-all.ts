/**
 * Mark all as read: знімок ID непрочитаних їде з сервера в браузер (щоб
 * діалог показав число) і назад - порціями.
 *
 * Тіло запиту Server Action - до 1 МБ за замовчуванням
 * (node_modules/next/dist/docs/01-app/02-guides/server-actions.md, «Body size
 * limit»), а UUID у JSON - близько 39 байт. Тобто в один запит влазить
 * приблизно 25 тисяч ID, а після першої перевірки сотень компаній непрочитаних
 * може бути більше. Тому клієнт шле знімок порціями, а сервер приймає не
 * більше однієї порції за раз.
 */

/** Скільки ID в одному запиті: близько 200 КБ, із запасом до ліміту. */
export const MARK_ALL_BATCH = 5000;

/** Знімок, нарізаний на порції для послідовних запитів. */
export function toBatches(ids: string[]): string[][] {
  const batches: string[][] = [];

  for (let start = 0; start < ids.length; start += MARK_ALL_BATCH) {
    batches.push(ids.slice(start, start + MARK_ALL_BATCH));
  }

  return batches;
}

/**
 * Порція ID з аргументу Server Action або `null`, якщо це не масив рядків чи
 * він довший за порцію. Чи це справді UUID і чи вакансії свої, перевіряє вже
 * запит до бази (`markVacanciesRead`).
 */
export function parseVacancyIds(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    value.length > MARK_ALL_BATCH ||
    !value.every((id) => typeof id === "string")
  ) {
    return null;
  }

  return value;
}
