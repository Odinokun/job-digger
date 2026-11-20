/**
 * Формат CSV для експорту й імпорту компаній (docs/ui.md, розділ 10).
 *
 * Чотири колонки: план давав три, `career_label` додано рішенням автора
 * 20.11.2026 (задача 6.05) - без неї підписи джерел губилися б при перенесенні
 * Export → Import.
 */
export const CSV_COLUMNS = [
  "company_name",
  "company_url",
  "career_url",
  "career_label",
] as const;

export type CsvRow = Record<(typeof CSV_COLUMNS)[number], string>;

/**
 * Перші символи, з яких таблиця може почати формулу. Список OWASP «CSV
 * Injection» (https://owasp.org/www-community/attacks/CSV_Injection): ширший
 * за чотири символи з docs/security.md - ще Tab, CR, LF і повноширинні
 * варіанти, які деякі локалі теж читають як формулу.
 */
const FORMULA_STARTS = new Set([
  "=",
  "+",
  "-",
  "@",
  "\t",
  "\r",
  "\n",
  "＝",
  "＋",
  "－",
  "＠",
]);

/** Що змушує взяти поле в лапки за RFC 4180. Крапка з комою - для Excel з українською локаллю. */
const NEEDS_QUOTES = /[",;\r\n]/;

/**
 * Одне поле CSV.
 *
 * Небезпечний початок - одинарна лапка спереду й поле в лапках, як радить
 * OWASP. Імпорт (6.06) знімає цю лапку, якщо за нею йде такий самий символ,
 * тож експортований файл повертається в базу без змін.
 */
export function escapeCsvCell(value: string): string {
  const defused = FORMULA_STARTS.has(value.charAt(0)) ? `'${value}` : value;

  return defused !== value || NEEDS_QUOTES.test(defused)
    ? `"${defused.replaceAll('"', '""')}"`
    : defused;
}

/**
 * Увесь файл: BOM, заголовок і рядки, кожен закінчується CRLF (RFC 4180).
 * BOM - підказка таблицям, що файл в UTF-8: без нього Excel, наскільки відомо,
 * може прочитати кирилицю в іншому кодуванні (не перевірено). Імпорт приймає
 * файл і з BOM, і без нього.
 */
export function toCsv(rows: CsvRow[]): string {
  const lines = [
    CSV_COLUMNS.join(","),
    ...rows.map((row) =>
      CSV_COLUMNS.map((column) => escapeCsvCell(row[column])).join(","),
    ),
  ];

  return `﻿${lines.map((line) => `${line}\r\n`).join("")}`;
}
