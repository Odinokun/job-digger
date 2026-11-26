import { describe, expect, it } from "vitest";

import { CSV_COLUMNS, escapeCsvCell, toCsv } from "./format.ts";

describe("escapeCsvCell", () => {
  it("leaves a plain value as it is", () => {
    expect(escapeCsvCell("Acme")).toBe("Acme");
    expect(escapeCsvCell("https://acme.com/careers")).toBe(
      "https://acme.com/careers",
    );
    expect(escapeCsvCell("")).toBe("");
  });

  it("quotes a value with a separator, a quote or a line break", () => {
    // RFC 4180: such fields are quoted, and quotes inside are doubled.
    expect(escapeCsvCell("Acme, Inc.")).toBe('"Acme, Inc."');
    expect(escapeCsvCell("Acme; Inc.")).toBe('"Acme; Inc."');
    expect(escapeCsvCell('The "Best" Co')).toBe('"The ""Best"" Co"');
    expect(escapeCsvCell("two\nlines")).toBe('"two\nlines"');
  });

  it("defuses anything a spreadsheet could run as a formula", () => {
    // OWASP CSV Injection: a single quote at the start and the field in quotes.
    expect(escapeCsvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(escapeCsvCell("+1")).toBe(`"'+1"`);
    expect(escapeCsvCell("-1")).toBe(`"'-1"`);
    expect(escapeCsvCell("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
    expect(escapeCsvCell("\t=1")).toBe(`"'\t=1"`);
    expect(escapeCsvCell("\r=1")).toBe(`"'\r=1"`);
    expect(escapeCsvCell("\n=1")).toBe(`"'\n=1"`);
    // Some locales read the full-width variants as a formula too.
    expect(escapeCsvCell("＝1")).toBe(`"'＝1"`);
    expect(escapeCsvCell('=1+2";=1+2')).toBe(`"'=1+2"";=1+2"`);
  });
});

describe("toCsv", () => {
  it("writes the header and rows with a BOM and CRLF", () => {
    // The BOM tells spreadsheets the file is UTF-8; CRLF is the line separator
    // by RFC 4180.
    const csv = toCsv([
      {
        company_name: "Acme",
        company_url: "https://acme.com",
        career_url: "https://boards.greenhouse.io/acme",
        career_label: "",
      },
      {
        company_name: "Бета, ТОВ",
        company_url: "",
        career_url: "",
        career_label: "",
      },
    ]);

    expect(csv).toBe(
      "﻿" +
        "company_name,company_url,career_url,career_label\r\n" +
        "Acme,https://acme.com,https://boards.greenhouse.io/acme,\r\n" +
        '"Бета, ТОВ",,,\r\n',
    );
  });

  it("names the four columns of the format", () => {
    expect(CSV_COLUMNS).toEqual([
      "company_name",
      "company_url",
      "career_url",
      "career_label",
    ]);
  });
});
