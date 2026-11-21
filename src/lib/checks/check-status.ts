/**
 * Стан загальної перевірки, який інтерфейс отримує опитуванням
 * (src/server/checks/README.md). Тип спільний: його повертає сервер
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
 * (src/server/checks/README.md). Успішних - `checked - failed`.
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
  /**
   * Триває Find new pages (задача 5.10): запуску в нього немає, тож окремим
   * прапорцем. Поки він `true`, інтерфейс опитує стан.
   */
  findingNewPages: boolean;
}

/**
 * Рядок History (docs/ui.md, розділ 4.4): рівно пʼять показників завершеної
 * загальної перевірки.
 */
export interface CheckRunRow {
  id: string;
  /** Date & time - час запуску. */
  startedAt: Date;
  /** Скільки джерел перевірено, зокрема невдалих. */
  sourcesChecked: number;
  newVacancies: number;
  removedVacancies: number;
  durationMs: number;
}
