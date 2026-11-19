/**
 * Стан загальної перевірки, який інтерфейс отримує опитуванням
 * (docs/checks-and-queue.md, розділ 8). Тип спільний: його повертає сервер
 * (`server/checks/check-status.ts`) і читає клієнт.
 */

/** Хід активного запуску - числа для «Checking 37/120». */
export interface RunProgress {
  /** Скільки джерел у запуску. */
  total: number;
  /** Скільки перевірено - разом із невдалими. */
  checked: number;
  failed: number;
  newVacancies: number;
  removedVacancies: number;
}

/**
 * Підсумок завершеного запуску, який ще не показували
 * (docs/checks-and-queue.md, розділ 8). Успішних - `checked - failed`.
 */
export interface RunSummary {
  runId: string;
  checked: number;
  failed: number;
  newVacancies: number;
  removedVacancies: number;
}

export interface CheckStatus {
  /** Активний запуск користувача або `null`, якщо перевірка не йде. */
  run: RunProgress | null;
  /** Останній завершений запуск із непоказаним підсумком. */
  summary: RunSummary | null;
  /** Кількість непрочитаних вакансій - лічильник у меню й назві вкладки. */
  unread: number;
}
