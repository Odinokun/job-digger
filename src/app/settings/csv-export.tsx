"use client";

import { Button, Checkbox } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  DEFAULT_EXPORT_OPTIONS,
  exportCsvHref,
  type ExportCsvOptions,
} from "@/lib/csv/export-options";

const OPTIONS = ["tracked", "notTracked", "careerUrls"] as const;

/**
 * Export CSV with options (task 6.05).
 *
 * `/api/companies-csv` returns the file: the browser does not open an address
 * with `Content-Disposition: attachment` but saves it, and the page stays where
 * it is. With no list selected there is nothing to export - the button is
 * disabled.
 */
export function CsvExport() {
  const t = useTranslations("SettingsPage.export");
  const [options, setOptions] = useState<ExportCsvOptions>(
    DEFAULT_EXPORT_OPTIONS,
  );
  const hasList = options.tracked || options.notTracked;

  return (
    <div className="flex flex-col items-start gap-3">
      <div className="flex flex-col gap-2">
        {OPTIONS.map((key) => (
          <Checkbox
            key={key}
            isSelected={options[key]}
            onChange={(isSelected) =>
              setOptions((previous) => ({ ...previous, [key]: isSelected }))
            }
          >
            <Checkbox.Content>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <span className="text-sm">{t(key)}</span>
            </Checkbox.Content>
          </Checkbox>
        ))}
      </div>
      <Button
        variant="secondary"
        isDisabled={!hasList}
        onPress={() => {
          window.location.assign(exportCsvHref(options));
        }}
      >
        {t("button")}
      </Button>
    </div>
  );
}
