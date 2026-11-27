/**
 * The Import CSV file limit and the import action's response (task 6.06). In
 * `src/lib` because the page also checks the size, before sending.
 */

/**
 * 1,000,000 bytes - the author's decision of 20.11.2026 instead of the 5 MB in the
 * original plan. A Server Action in Next accepts a body of up to 1 MB by default,
 * multipart overhead included ("By default, the maximum size of the request body sent to
 * a Server Action is 1MB", node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md),
 * so the file has to be a little smaller than the limit itself.
 */
export const CSV_IMPORT_MAX_BYTES = 1_000_000;

export type ImportCsvResult =
  | {
      status: "imported";
      companiesAdded: number;
      sourcesAdded: number;
      duplicates: number;
      errors: number;
    }
  | {
      status: "refused";
      /**
       * `header` - not our header, `encoding` - not UTF-8, `too-large` - more than
       * `CSV_IMPORT_MAX_BYTES`, `no-file` - no file chosen.
       */
      reason: "header" | "encoding" | "too-large" | "no-file";
    }
  | { status: "failed-unexpectedly" };
