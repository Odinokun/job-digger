"use client";

import { Spinner } from "@heroui/react";
import { useTranslations } from "next-intl";

import { useCheckStatus } from "./check-status-provider";

/**
 * Індикатор загальної перевірки в шапці: «Checking 37/120»
 * (docs/checks-and-queue.md, розділ 8). Лічильник - перевірені джерела разом
 * із невдалими. Видно лише поки запуск активний; стан дає опитування
 * (`check-status-provider.tsx`), а після Check all - її відповідь, тож
 * індикатор зʼявляється одразу.
 */
export function CheckProgress() {
  const t = useTranslations("Nav");
  const { status } = useCheckStatus();
  const run = status?.run;

  return (
    // Живий регіон існує завжди, а текст у ньому зʼявляється: читалка екрана
    // оголошує зміну лише в регіоні, який уже був на сторінці.
    <div role="status" className="ml-auto text-sm text-muted">
      {run ? (
        <span className="flex items-center gap-2">
          <Spinner color="current" size="sm" />
          {t("checking", { checked: run.checked, total: run.total })}
        </span>
      ) : null}
    </div>
  );
}
