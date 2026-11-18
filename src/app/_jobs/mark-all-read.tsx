"use client";

import { AlertDialog, Button, useOverlayState } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { WithTooltip } from "@/app/components/icon-button";
import { useActionFailedToast } from "@/app/components/use-action-failed-toast";

import { countUnreadAction, markAllReadAction } from "./actions";

interface MarkAllReadProps {
  /** Непрочитаних, які були в списку, більше немає: список порожніє. */
  onMarked: () => void;
}

/**
 * Mark all as read у вкладці Unread і діалог підтвердження до неї
 * (docs/ui.md, розділ 4.1) - єдина дія над вакансіями з підтвердженням.
 *
 * Натискання бере з сервера кількість непрочитаних (усіх, не лише завантажених
 * у списку) і межу - час бази. Підтвердження позначає вакансії, записані не
 * пізніше межі, одним запитом. Знайдені, поки діалог відкритий, лишаються Unread
 * (src/server/vacancies/README.md, «Одночасні зміни»).
 *
 * `AlertDialog`, як у видаленні компанії: вікно вимагає рішення. Кнопка
 * підтвердження закриває його лише після успіху, а не натисканням.
 */
export function MarkAllRead({ onMarked }: MarkAllReadProps) {
  const t = useTranslations("JobsPage.markAllRead");
  const tCommon = useTranslations("Common");
  const showActionFailed = useActionFailedToast();
  const overlay = useOverlayState();
  const [found, setFound] = useState<{ count: number; asOf: string } | null>(
    null,
  );
  const [isLoading, startLoading] = useTransition();
  const [isMarking, startMarking] = useTransition();

  const open = () => {
    startLoading(async () => {
      const result = await countUnreadAction();

      if (!result.ok) {
        showActionFailed();
        return;
      }

      // Непрочитаних уже немає - прочитали в іншій вкладці. Питати нема про
      // що, а список має це показати.
      if (result.count === 0) {
        onMarked();
        return;
      }

      setFound({ count: result.count, asOf: result.asOf });
      overlay.open();
    });
  };

  const confirm = () => {
    if (found === null) return;

    startMarking(async () => {
      const result = await markAllReadAction(found.asOf);

      if (!result.ok) {
        showActionFailed();
        return;
      }

      onMarked();
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
            <WithTooltip label={tCommon("close")}>
              <AlertDialog.CloseTrigger aria-label={tCommon("close")} />
            </WithTooltip>
            <AlertDialog.Header>
              <AlertDialog.Icon status="accent" />
              <AlertDialog.Heading>{t("title")}</AlertDialog.Heading>
            </AlertDialog.Header>

            <AlertDialog.Body>
              <p>{t("body", { count: found?.count ?? 0 })}</p>
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
