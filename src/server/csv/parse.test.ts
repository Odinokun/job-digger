import { describe, expect, it } from "vitest";

import { escapeCsvCell, toCsv } from "./format.ts";
import { parseCompaniesCsv } from "./parse.ts";

const HEADER = "company_name,company_url,career_url,career_label";

describe("parseCompaniesCsv", () => {
  it("reads rows by column name", () => {
    expect(
      parseCompaniesCsv(
        `${HEADER}\nAcme,acme.com,https://boards.greenhouse.io/acme,US\n`,
      ),
    ).toEqual({
      ok: true,
      rows: [
        {
          company_name: "Acme",
          company_url: "acme.com",
          career_url: "https://boards.greenhouse.io/acme",
          career_label: "US",
        },
      ],
      malformed: 0,
    });
  });

  it("reads back exactly what the export wrote", () => {
    // Експорт → імпорт без втрат: лапки, коми, переноси, кирилиця, BOM, CRLF
    // і знешкоджені формули.
    const rows = [
      {
        company_name: 'Бета, "ТОВ"',
        company_url: "https://beta.ua",
        career_url: "",
        career_label: "two\nlines",
      },
      {
        company_name: "=HYPERLINK(1)",
        company_url: "",
        career_url: "https://jobs.lever.co/minus",
        career_label: "-remote",
      },
    ];

    expect(parseCompaniesCsv(toCsv(rows))).toEqual({
      ok: true,
      rows,
      malformed: 0,
    });
  });

  it("keeps a leading quote that does not hide a formula", () => {
    // Знімаємо лише ту лапку, яку ставить експорт: перед символом формули.
    expect(escapeCsvCell("'Acme")).toBe("'Acme");
    const result = parseCompaniesCsv(`${HEADER}\n'Acme,acme.com,,\n`);

    expect(result.ok && result.rows[0].company_name).toBe("'Acme");
  });

  it("takes semicolons when the header uses them", () => {
    // Excel з українською локаллю зберігає CSV із `;`.
    const result = parseCompaniesCsv(
      "company_name;company_url;career_url;career_label\r\nAcme, Inc.;acme.com;;\r\n",
    );

    expect(result).toEqual({
      ok: true,
      rows: [
        {
          company_name: "Acme, Inc.",
          company_url: "acme.com",
          career_url: "",
          career_label: "",
        },
      ],
      malformed: 0,
    });
  });

  it("accepts the three-column file without labels, in any column order", () => {
    const result = parseCompaniesCsv(
      "career_url,company_name,company_url\nhttps://jobs.lever.co/acme,Acme,acme.com\n",
    );

    expect(result).toEqual({
      ok: true,
      rows: [
        {
          company_name: "Acme",
          company_url: "acme.com",
          career_url: "https://jobs.lever.co/acme",
          career_label: "",
        },
      ],
      malformed: 0,
    });
  });

  it("skips blank lines and counts rows of the wrong width", () => {
    const result = parseCompaniesCsv(
      `${HEADER}\n\nAcme,acme.com,,\nBroken,row\n`,
    );

    expect(result).toMatchObject({ ok: true, malformed: 1 });
    expect(result.ok && result.rows.map((row) => row.company_name)).toEqual([
      "Acme",
    ]);
  });

  it("refuses the whole file when the header is not ours", () => {
    // Жодного часткового імпорту: незнайомий файл - одна зрозуміла відмова.
    expect(parseCompaniesCsv("name,url\nAcme,acme.com\n")).toEqual({
      ok: false,
      problem: "header",
    });
    expect(parseCompaniesCsv(`${HEADER},extra\nAcme,acme.com,,,x\n`)).toEqual({
      ok: false,
      problem: "header",
    });
    expect(parseCompaniesCsv("company_name,company_name,career_url\n")).toEqual(
      { ok: false, problem: "header" },
    );
    expect(parseCompaniesCsv("")).toEqual({ ok: false, problem: "header" });
  });
});
