/**
 * Опції Export CSV (docs/ui.md, розділ 10) і адреса, якою їх передають
 * маршруту завантаження `/api/companies-csv`. У `src/lib`, бо адресу складає
 * сторінка Settings, а читає сервер.
 */
export interface ExportCsvOptions {
  tracked: boolean;
  notTracked: boolean;
  careerUrls: boolean;
}

/** За замовчуванням - обидва списки, без карʼєрних адрес. */
export const DEFAULT_EXPORT_OPTIONS: ExportCsvOptions = {
  tracked: true,
  notTracked: true,
  careerUrls: false,
};

const KEYS = ["tracked", "notTracked", "careerUrls"] as const;

/** Адреса файлу: лише ввімкнені опції, кожна - `=1`. */
export function exportCsvHref(options: ExportCsvOptions): string {
  const params = new URLSearchParams();

  for (const key of KEYS) {
    if (options[key]) params.set(key, "1");
  }

  return `/api/companies-csv?${params.toString()}`;
}

/** Опції з адреси. Усе, крім `1`, - вимкнено: адресу можна набрати руками. */
export function parseExportOptions(params: URLSearchParams): ExportCsvOptions {
  return {
    tracked: params.get("tracked") === "1",
    notTracked: params.get("notTracked") === "1",
    careerUrls: params.get("careerUrls") === "1",
  };
}
