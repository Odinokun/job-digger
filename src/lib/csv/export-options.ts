/**
 * Export CSV options and the address that passes them to the `/api/companies-csv`
 * download route. In `src/lib` because the Settings page builds the address and the
 * server reads it.
 */
export interface ExportCsvOptions {
  tracked: boolean;
  notTracked: boolean;
  careerUrls: boolean;
}

/** By default - both lists, without career addresses. */
export const DEFAULT_EXPORT_OPTIONS: ExportCsvOptions = {
  tracked: true,
  notTracked: true,
  careerUrls: false,
};

const KEYS = ["tracked", "notTracked", "careerUrls"] as const;

/** The file address: only the enabled options, each as `=1`. */
export function exportCsvHref(options: ExportCsvOptions): string {
  const params = new URLSearchParams();

  for (const key of KEYS) {
    if (options[key]) params.set(key, "1");
  }

  return `/api/companies-csv?${params.toString()}`;
}

/** Options from the address. Anything except `1` is off: the address can be typed by hand. */
export function parseExportOptions(params: URLSearchParams): ExportCsvOptions {
  return {
    tracked: params.get("tracked") === "1",
    notTracked: params.get("notTracked") === "1",
    careerUrls: params.get("careerUrls") === "1",
  };
}
