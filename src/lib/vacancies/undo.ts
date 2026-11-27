/**
 * Undo notices after an action on a vacancy (task vacancy-undo-toast).
 */

/** How many Undo notices are visible at once (the author's decision of 24.11.2026). */
export const MAX_UNDO_NOTICES = 3;

/**
 * The open Undo notices after a new one appears: at most three, and the extra ones -
 * the oldest - have to be closed. HeroUI `maxVisibleToasts` does not close old ones,
 * it only hides them in the stack, so we count ourselves. `open` holds the keys from
 * the oldest to the newest.
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
