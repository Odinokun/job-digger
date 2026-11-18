"use client";

import { AlertDialog, Button, useOverlayState } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { useActionFailedToast } from "@/app/components/use-action-failed-toast";
import { toBatches } from "@/lib/vacancies/mark-all";

import { listUnreadIdsAction, markVacanciesReadAction } from "./actions";

interface MarkAllReadProps {
  /** Позначені вакансії: список прибирає їх зі вкладки Unread. */
  onMarked: (ids: ReadonlySet<string>) => void;
}

/**
 * Mark all as read у вкладці Unread і діалог підтвердження до неї
 * (docs/ui.md, розділ 4.1) - єдина дія над вакансіями з підтвердженням.
 *
 * Межа дії - знімок: натискання бере з сервера ID усіх непрочитаних (не лише
 * завантажених у списку), діалог показує їх кількість, а підтвердження
 * позначає рівно їх. Знайдені, поки діалог відкритий, лишаються Unread
 * (src/server/vacancies/README.md, «Одночасні зміни»). Знімок іде на сервер
 * порціями: тіло запиту Server Action обмежене (`src/lib/vacancies/mark-all.ts`).
 *
 * `AlertDialog`, як у видаленні компанії: вікно вимагає рішення. Кнопка
 * підтвердження закриває його лише після успіху, а не натисканням.
 */
export function MarkAllRead({ onMarked }: MarkAllReadProps) {
  const t = useTranslations("JobsPage.markAllRead");
  const showActionFailed = useActionFailedToast();
  const overlay = useOverlayState();
  const [snapshot, setSnapshot] = useState<string[]>([]);
  const [isLoading, startLoading] = useTransition();
  const [isMarking, startMarking] = useTransition();

  const open = () => {
    startLoading(async () => {
      const result = await listUnreadIdsAction();

      if (!result.ok) {
        showActionFailed();
        return;
      }

      // Непрочитаних уже немає - прочитали в іншій вкладці. Питати нема про
      // що, а список має це показати.
      if (result.ids.length === 0) {
        onMarked(new Set());
        return;
      }

      setSnapshot(result.ids);
      overlay.open();
    });
  };

  const confirm = () => {
    startMarking(async () => {
      // Порції - послідовно: Next і так виконує дії однієї вкладки по черзі
      // (node_modules/next/dist/docs/01-app/02-guides/server-actions.md,
      // «Sequential dispatch on the client»).
      for (const batch of toBatches(snapshot)) {
        const result = await markVacanciesReadAction(batch);

        if (!result.ok) {
          showActionFailed();
          return;
        }
      }

      onMarked(new Set(snapshot));
      overlay.close();
    });
  };

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        isPending={isLoading}
        onPress={open}
      >
        {t("open")}
      </Button>

      <AlertDialog.Backdrop
        isOpen={overlay.isOpen}
        onOpenChange={overlay.setOpen}
      >
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-100">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="accent" />
              <AlertDialog.Heading>{t("title")}</AlertDialog.Heading>
            </AlertDialog.Header>

            <AlertDialog.Body>
              <p>{t("body", { count: snapshot.length })}</p>
            </AlertDialog.Body>

            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">
                {t("cancel")}
              </Button>
              <Button isPending={isMarking} onPress={confirm}>
                {t("confirm")}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </>
  );
}
