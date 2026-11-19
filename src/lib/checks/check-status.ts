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

export interface CheckStatus {
  /** Активний запуск користувача або `null`, якщо перевірка не йде. */
  run: RunProgress | null;
  /** Кількість непрочитаних вакансій - лічильник у меню й назві вкладки. */
  unread: number;
}
