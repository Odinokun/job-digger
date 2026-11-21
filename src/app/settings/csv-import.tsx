"use client";

import { Button, Spinner } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";

import { useActionFailedToast } from "@/app/components/use-action-failed-toast";
import {
  CSV_IMPORT_MAX_BYTES,
  type ImportCsvResult,
} from "@/lib/csv/import-result";

import { importCsvAction } from "./actions";

/**
 * Import CSV з підсумком (docs/ui.md, розділ 10; задача 6.06).
 *
 * Звичайна форма з файлом: Server Action приймає `FormData` з `File`
 * напряму. Розмір перевіряється ще тут, до відправлення: більший файл Next
 * відкинув би сам, без зрозумілого повідомлення.
 */
export function CsvImport() {
  const t = useTranslations("SettingsPage.import");
  const showActionFailed = useActionFailedToast();
  const [result, submit, isPending] = useActionState(importCsvAction, null);
  const [tooLarge, setTooLarge] = useState(false);
  const [hasFile, setHasFile] = useState(false);

  useEffect(() => {
    if (result?.status === "failed-unexpectedly") {
      showActionFailed();
    }
  }, [result, showActionFailed]);

  return (
    <form
      action={submit}
      // React скидає поля форми після дії, тож і вибраного файлу далі немає.
      onSubmit={() => setHasFile(false)}
      className="flex flex-col items-start gap-3"
    >
      <input
        type="file"
        name="file"
        accept=".csv,text/csv"
        aria-label={t("file")}
        className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-default file:px-3 file:py-1.5 file:text-sm file:text-default-foreground"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          setHasFile(file !== undefined);
          setTooLarge(file !== undefined && file.size > CSV_IMPORT_MAX_BYTES);
        }}
      />
      <Button
        type="submit"
        variant="secondary"
        isDisabled={!hasFile || tooLarge}
        isPending={isPending}
      >
        {({ isPending: isImporting }) => (
          <>
            {isImporting ? <Spinner color="current" size="sm" /> : null}
            {t("button")}
          </>
        )}
      </Button>
      <p className="text-hint text-muted">{t("hint")}</p>
      {/* Підсумок і відмови - живий регіон: результат приходить після
          відправлення, і читач екрана має його почути. */}
      <p role="status" className="text-sm">
        {tooLarge ? t("refused.too-large") : <ResultText result={result} />}
      </p>
    </form>
  );
}

function ResultText({ result }: { result: ImportCsvResult | null }) {
  const t = useTranslations("SettingsPage.import");

  if (result === null || result.status === "failed-unexpectedly") {
    return null;
  }

  if (result.status === "refused") {
    return <span className="text-danger">{t(`refused.${result.reason}`)}</span>;
  }

  return (
    <>
      {t("summary", {
        companies: result.companiesAdded,
        sources: result.sourcesAdded,
        duplicates: result.duplicates,
        errors: result.errors,
      })}
    </>
  );
}
