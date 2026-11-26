/**
 * The CSV format for exporting and importing companies.
 *
 * Four columns: the original plan had three; `career_label` was added (task
 * 6.05) because without it source labels were lost on the way Export → Import.
 */
export const CSV_COLUMNS = [
  "company_name",
  "company_url",
  "career_url",
  "career_label",
] as const;

export type CsvRow = Record<(typeof CSV_COLUMNS)[number], string>;

/**
 * First characters a spreadsheet may start a formula with. The OWASP "CSV
 * Injection" list (https://owasp.org/www-community/attacks/CSV_Injection): wider
 * than the four characters of the original plan (`=`, `+`, `-`, `@`) - also Tab,
 * CR, LF and the full-width variants, which some locales read as a formula too.
 */
export const FORMULA_STARTS = new Set([
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

/** What makes a field quoted by RFC 4180. The semicolon is for Excel with a Ukrainian locale. */
const NEEDS_QUOTES = /[",;\r\n]/;

/**
 * One CSV field.
 *
 * A dangerous start gets a single quote in front and the field in quotes, as
 * OWASP advises. Import (6.06) removes this quote if such a character follows
 * it, so an exported file goes back into the database unchanged.
 */
export function escapeCsvCell(value: string): string {
  const defused = FORMULA_STARTS.has(value.charAt(0)) ? `'${value}` : value;

  return defused !== value || NEEDS_QUOTES.test(defused)
    ? `"${defused.replaceAll('"', '""')}"`
    : defused;
}

/**
 * The whole file: the BOM, the header and the rows, each ending with CRLF (RFC
 * 4180). The BOM tells spreadsheets the file is UTF-8: without it Excel, as far
 * as is known, may read Cyrillic in another encoding (not checked). Import
 * accepts a file both with and without a BOM.
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
