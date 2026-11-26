"use client";

import { Button, Spinner } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";

import { useActionFailedToast } from "@/app/components/use-action-failed-toast";
import {
  CSV_IMPORT_MAX_BYTES,
  type ImportCsvResult,
} from "@/lib/csv/import-result";

import { importCsvAction } from "./actions";

/**
 * Import CSV with a summary (task 6.06).
 *
 * A plain form with a file: the Server Action takes `FormData` with a `File`
 * directly. The size is checked here already, before sending: Next would reject
 * a bigger file by itself, without a clear message.
 */
export function CsvImport() {
  const t = useTranslations("SettingsPage.import");
  const showActionFailed = useActionFailedToast();
  const [result, submit, isPending] = useActionState(importCsvAction, null);
  const [tooLarge, setTooLarge] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const hasFile = fileName !== null;
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (result?.status === "failed-unexpectedly") {
      showActionFailed();
    }
  }, [result, showActionFailed]);

  return (
    <form
      action={submit}
      // React resets the form fields after the action, so the chosen file is gone too.
      onSubmit={() => setFileName(null)}
      className="flex flex-col items-start gap-3"
    >
      {/* The system file picker ("Choose File / No file chosen") had a different
          font and look from everything around it (UI audit, B5). So the field
          itself is hidden, and an app button opens it; the file name is shown
          next to it. The field stays in the form: the Server Action takes the
          file from FormData. */}
      <input
        ref={fileInput}
        type="file"
        name="file"
        accept=".csv,text/csv"
        aria-label={t("file")}
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          setFileName(file?.name ?? null);
          setTooLarge(file !== undefined && file.size > CSV_IMPORT_MAX_BYTES);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          onPress={() => fileInput.current?.click()}
        >
          {t("choose")}
        </Button>
        <span className="text-sm break-all text-muted">
          {fileName ?? t("noFile")}
        </span>
      </div>
      {/* A primary button: disabled, it is clearly paler than a secondary one
          with a border, so it shows that import is not available yet. */}
      <Button
        type="submit"
        variant="primary"
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
      {/* The summary and the refusals are a live region: the result arrives
          after sending, and a screen reader has to announce it. */}
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
