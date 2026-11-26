/**
 * Інтервал автоматичної перевірки в годинах.
 *
 * Перелік тут, а не в схемі бази: його показує сторінка Settings, а `CHECK` на
 * колонці `settings.auto_check_interval_hours` будується з нього ж.
 */
export const AUTO_CHECK_INTERVALS = [3, 6, 12, 24] as const;

export type AutoCheckInterval = (typeof AUTO_CHECK_INTERVALS)[number];

/** Доки користувач не вибрав. */
export const DEFAULT_AUTO_CHECK_INTERVAL: AutoCheckInterval = 6;

/**
 * Інтервал із недовіреного значення - аргумента Server Action чи поля форми.
 *
 * `null`, а не значення за замовчуванням: на відміну від теми, тут значення
 * зберігається в базу, і хибний запит має бути відхилений, а не тихо
 * перетворений на інший вибір.
 */
export function parseAutoCheckInterval(
  value: unknown,
): AutoCheckInterval | null {
  const hours =
    typeof value === "string" && value !== "" ? Number(value) : value;

  return AUTO_CHECK_INTERVALS.includes(hours as AutoCheckInterval)
    ? (hours as AutoCheckInterval)
    : null;
}
