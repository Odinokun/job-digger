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
 * Export CSV з опціями (задача 6.05).
 *
 * Файл віддає `/api/companies-csv`: перехід на адресу з
 * `Content-Disposition: attachment` браузер не відкриває, а зберігає, і
 * сторінка лишається на місці. Без жодного списку експортувати нічого -
 * кнопка вимкнена.
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
