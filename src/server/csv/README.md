# src/server/csv - the company CSV

Export and Import from the Settings page (tasks 6.05-6.07).

| File             | Contents                                                     |
| ---------------- | ------------------------------------------------------------ |
| `format.ts`      | `CSV_COLUMNS`, `escapeCsvCell`, `toCsv` - the file format     |
| `format.test.ts` | RFC 4180 quoting, formula escaping, BOM and CRLF             |
| `parse.ts` | `parseCompaniesCsv` - parsing an Import file: BOM, the delimiter from the header, RFC 4180, removing the formula quote |
| `parse.test.ts` | Export → parse without loss, `;`, a three-column file, empty and broken rows, a foreign header |
| `import.ts` | `importCompanies` - the file rows into the database in one transaction, with a summary |
| `import.integration.test.ts` | A new and an existing company, a company without a site, duplicates in the file and in the database, rows with errors, other users' companies |
| `export.ts` | `exportCompanyRows` - the Export CSV rows for the chosen options |
| `export.integration.test.ts` | A row per company or per source, choosing the lists, a company without a site, other users' companies stay out |

## Format

Four columns: `company_name`, `company_url`, `career_url`, `career_label`. The
original plan had three; `career_label` was added because without it source labels
("USA", "DE" at Mozilla) were lost on the way Export → Import.

- One row is one source; a company without sources is one row with empty
  `career_url` and `career_label`.
- The file starts with a BOM, and lines end with CRLF (RFC 4180).
- **Formulas.** A field that starts with a character a spreadsheet may start a formula
  with gets a single quote in front and is wrapped in quotes. The list of characters
  comes from OWASP "CSV Injection" and is wider than the original plan: besides `=`,
  `+`, `-`, `@` it has Tab, CR, LF and the full-width `＝＋－＠`. OWASP warns that
  Excel may remove the escaping after the file is saved and reopened, and there is no
  universal protection. Import removes the quote if such a character follows it.

## Import

Parsing is `parse.ts`, writing is `import.ts`. Decisions (task 6.06):

- **The whole file is rejected** only over its header: an unknown or repeated column,
  or a missing required one. Columns are found by name, in any order; a file without
  `career_label` (the old three-column one) is accepted. The delimiter is `,` or `;`,
  taken from the header. The BOM is optional.
- **The formula quote** (`'` before `=`, `+`, … - the way export writes it) is
  removed; any other quote at the start is part of the value.
- **The site is required:** a row without `company_url` is a row error (task
  company-site-required).
- **The same company** is an exact match of the cleaned site address. The "same
  domain" and "same name" warnings do not stop an import: there is nobody to confirm
  them. The name of an existing company does not change.
- **Summary:** added companies and pages; duplicates - every page that this or
  another company already has, and a row without a page for a company that already
  exists (including repeats inside the file); errors - a row without a name, without
  both addresses, with a bad address or with a different number of fields.
- An own page's recipe (task 6.21) and the "Link only" mark (6.17) do not go into the
  file: after Import such a page is Unsupported again, and the recipe is given again
  with the Read as list button.
- Everything in one transaction. No page search runs after import; a company without
  pages is in Not tracked with the status Not checked.
