"use client";

import { Button } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

/**
 * The screen shown instead of a page whose render failed.
 *
 * The props are written by hand: Next generates no type for `error.tsx`, and in
 * the docs of the installed version they are exactly these -
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`.
 * The prop is called `retry`, not `reset` as it was before Next 16.
 */
type AppErrorProps = {
  error: unknown;
  retry: () => void;
};

/**
 * The app-level error boundary: catches a failure of any page.
 *
 * The typical case is a database that is not running: the page reads it in a
 * server component, and without this screen the user would see nothing. The
 * cause is not shown: the error text from a server component does not even
 * arrive here (only the `digest` is left), and the failure is out of the user's
 * hands anyway - all they can do is try again.
 *
 * This boundary does not cover the root layout itself: `error.tsx` wraps pages
 * and nested layouts, but not the layout it lives in. That would need
 * `global-error.tsx`; it is deliberately not added, because the layout does not
 * touch the database - it only reads the locale from a cookie.
 */
export default function AppError({ error, retry }: AppErrorProps) {
  const t = useTranslations("ErrorScreen");

  useEffect(() => {
    // The log is in English: a technical message, not UI text.
    console.error("Page render failed", error);
  }, [error]);

  return (
    <section className="mx-auto max-w-md py-16 text-center">
      <h2 className="text-xl font-semibold">{t("title")}</h2>
      <p className="mt-2 text-muted">{t("text")}</p>
      <Button className="mt-6" onPress={() => retry()}>
        {t("retry")}
      </Button>
    </section>
  );
}
