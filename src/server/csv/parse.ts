/**
 * Parsing the company CSV for Import (task 6.06).
 *
 * Our own RFC 4180 parsing instead of a library: the format is ours and narrow
 * (one table, text fields), and a few dozen lines are enough for it.
 */
import { CSV_COLUMNS, FORMULA_STARTS, type CsvRow } from "./format.ts";

export type ParseCsvResult =
  | {
      ok: true;
      rows: CsvRow[];
      /** Rows with a different number of fields than the header are errors. */
      malformed: number;
    }
  /** The header is not ours - the whole file is rejected, with no partial import. */
  | { ok: false; problem: "header" };

/** Without `career_label` - a file in the old three-column format. */
const OPTIONAL_COLUMNS = new Set<string>(["career_label"]);

export function parseCompaniesCsv(text: string): ParseCsvResult {
  // The BOM is optional: our export adds it, other programs do not.
  const body = text.startsWith("﻿") ? text.slice(1) : text;
  const firstLine = body.split(/\r\n|\n|\r/, 1)[0] ?? "";
  // The delimiter comes from the header: Excel with a Ukrainian locale writes `;`.
  const separator =
    firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
  const [header, ...records] = readRecords(body, separator);
  const columns = headerColumns(header ?? []);

  if (columns === null) {
    return { ok: false, problem: "header" };
  }

  const rows: CsvRow[] = [];
  let malformed = 0;

  for (const record of records) {
    // An empty row is not an error but just emptiness (often at the end of a file).
    if (record.length === 1 && record[0] === "") continue;

    if (record.length !== columns.length) {
      malformed += 1;
      continue;
    }

    const row: CsvRow = {
      company_name: "",
      company_url: "",
      career_url: "",
      career_label: "",
    };
    columns.forEach((column, index) => {
      row[column] = unescapeFormula(record[index]);
    });
    rows.push(row);
  }

  return { ok: true, rows, malformed };
}

/**
 * The header columns by name, or `null` if the header is not ours: every name is
 * from the format, without repeats, and all required ones are there. Any order.
 */
function headerColumns(header: string[]): Array<keyof CsvRow> | null {
  const names = header.map((name) => name.trim());
  const known = new Set<string>(CSV_COLUMNS);

  if (
    new Set(names).size !== names.length ||
    names.some((name) => !known.has(name)) ||
    CSV_COLUMNS.some(
      (column) => !OPTIONAL_COLUMNS.has(column) && !names.includes(column),
    )
  ) {
    return null;
  }

  return names as Array<keyof CsvRow>;
}

/**
 * Removes the single quote export puts before a formula character
 * (`escapeCsvCell`). Any other quote at the start is part of the value.
 */
function unescapeFormula(value: string): string {
  return value.startsWith("'") && FORMULA_STARTS.has(value.charAt(1))
    ? value.slice(1)
    : value;
}

/** File records by RFC 4180: quoted fields may contain the delimiter, `""` and line breaks. */
function readRecords(text: string, separator: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let index = 0;

  const endField = () => {
    record.push(field);
    field = "";
  };
  const endRecord = () => {
    endField();
    records.push(record);
    record = [];
  };

  while (index < text.length) {
    const char = text[index];

    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 2;
        continue;
      }
      if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      index += 1;
      continue;
    }

    if (char === '"' && field === "") {
      quoted = true;
    } else if (char === separator) {
      endField();
    } else if (char === "\r" || char === "\n") {
      // CRLF is one line break, not two.
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      endRecord();
    } else {
      field += char;
    }
    index += 1;
  }

  // The last row without a line break at the end of the file.
  if (field !== "" || record.length > 0) {
    endRecord();
  }

  return records;
}
