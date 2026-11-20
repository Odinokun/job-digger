/**
 * Межа файлу Import CSV і відповідь дії імпорту (задача 6.06). У `src/lib`,
 * бо розмір перевіряє й сторінка, ще до відправлення.
 */

/**
 * 1 000 000 байтів - рішення автора 20.11.2026 замість 5 МБ із плану. Server
 * Action у Next за замовчуванням приймає тіло до 1 МБ разом зі службовими
 * байтами multipart («By default, the maximum size of the request body sent to
 * a Server Action is 1MB», node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md),
 * тож файл має бути трохи меншим за саму межу.
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
       * `header` - не наш заголовок, `encoding` - не UTF-8, `too-large` -
       * більше за `CSV_IMPORT_MAX_BYTES`, `no-file` - файл не вибрано.
       */
      reason: "header" | "encoding" | "too-large" | "no-file";
    }
  | { status: "failed-unexpectedly" };
