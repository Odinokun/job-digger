/**
 * Розбір CSV компаній для Import (задача 6.06).
 *
 * Свій розбір за RFC 4180 замість бібліотеки: формат наш і вузький (одна
 * таблиця, текстові поля), і на нього вистачає кількох десятків рядків.
 */
import { CSV_COLUMNS, FORMULA_STARTS, type CsvRow } from "./format.ts";

export type ParseCsvResult =
  | {
      ok: true;
      rows: CsvRow[];
      /** Рядки з іншою кількістю полів, ніж у заголовку, - помилкові. */
      malformed: number;
    }
  /** Заголовок не наш - файл відхиляється цілком, без часткового імпорту. */
  | { ok: false; problem: "header" };

/** Без `career_label` - файл старого, триколонкового формату. */
const OPTIONAL_COLUMNS = new Set<string>(["career_label"]);

export function parseCompaniesCsv(text: string): ParseCsvResult {
  // BOM - необовʼязковий: його ставить наш експорт, а інші програми - ні.
  const body = text.startsWith("﻿") ? text.slice(1) : text;
  const firstLine = body.split(/\r\n|\n|\r/, 1)[0] ?? "";
  // Розділювач - за заголовком: Excel з українською локаллю пише `;`.
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
    // Порожній рядок - не помилка, а просто порожнеча (часто в кінці файлу).
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
 * Колонки заголовка за назвами або `null`, якщо він не наш: кожна назва -
 * з формату, без повторів, і є всі обовʼязкові. Порядок довільний.
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
 * Знімає одинарну лапку, яку експорт ставить перед символом формули
 * (`escapeCsvCell`). Інша лапка на початку - частина значення.
 */
function unescapeFormula(value: string): string {
  return value.startsWith("'") && FORMULA_STARTS.has(value.charAt(1))
    ? value.slice(1)
    : value;
}

/** Записи файлу за RFC 4180: поля в лапках можуть містити розділювач, `""` і переноси. */
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
      // CRLF - один перенос, а не два.
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      endRecord();
    } else {
      field += char;
    }
    index += 1;
  }

  // Останній рядок без переносу в кінці файлу.
  if (field !== "" || record.length > 0) {
    endRecord();
  }

  return records;
}
