/**
 * Сповіщення Undo після дії над вакансією (задача vacancy-undo-toast).
 */

/** Скільки сповіщень Undo видно одночасно (рішення автора 24.11.2026). */
export const MAX_UNDO_NOTICES = 3;

/**
 * Відкриті сповіщення Undo після появи нового: не більше трьох, а зайві -
 * найстаріші - треба закрити. HeroUI `maxVisibleToasts` старі не закриває,
 * лише ховає в стосі, тому рахуємо самі. `open` - ключі від найстарішого до
 * найновішого.
 */
export function keepRecentUndos(
  open: readonly string[],
  added: string,
  max: number = MAX_UNDO_NOTICES,
): { open: string[]; toClose: string[] } {
  const all = [...open, added];
  const overflow = Math.max(0, all.length - max);

  return { open: all.slice(overflow), toClose: all.slice(0, overflow) };
}
