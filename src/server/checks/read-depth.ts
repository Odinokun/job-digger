/**
 * Глибина читання завдань загальної перевірки (задача 6.16, рішення автора
 * 20.11.2026). Повна таблиця «хто скільки читає» - README поруч, «Глибина
 * читання».
 */
import type { ReadDepth } from "../parsers/vacancies-to-check.ts";

/** Повне читання в автоперевірці - не частіше ніж раз на добу на джерело. */
export const FULL_READ_EVERY_MS = 24 * 60 * 60 * 1000;

/**
 * - `first-page` - ручний Check all: лише перша сторінка кожного джерела;
 * - `auto` - автоперевірка: повністю, якщо джерело не читалось повністю
 *   добу й довше, інакше перша сторінка.
 */
export type CheckAllDepthMode = "first-page" | "auto";

export function taskReadDepth({
  mode,
  lastFullReadAt,
  now,
}: {
  mode: CheckAllDepthMode;
  lastFullReadAt: Date | null;
  now: Date;
}): ReadDepth {
  if (mode === "first-page") {
    return "first-page";
  }

  return lastFullReadAt === null ||
    now.getTime() - lastFullReadAt.getTime() >= FULL_READ_EVERY_MS
    ? "full"
    : "first-page";
}
