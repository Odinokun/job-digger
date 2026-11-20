"use client";

import { AlertDialog, Button, useOverlayState } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { WithTooltip } from "@/app/components/icon-button";
import { useActionFailedToast } from "@/app/components/use-action-failed-toast";

import {
  countReadAction,
  countUnreadAction,
  markAllReadAction,
  markAllUnreadAction,
} from "./actions";

interface MarkAllProps {
  /**
   * `read` - Mark all as read у вкладці Unread, `unread` - Mark all as unread у
   * вкладці Read (задача 6.18).
   */
  target: "read" | "unread";
  /** Вакансій, які були в списку, у вкладці більше немає: список порожніє. */
  onMarked: () => void;
}

/** Що бере діалог із сервера: число, а для Mark all as read - ще й межу. */
type Found = { count: number; asOf: string | null };

/** Число для діалогу (і межа для Mark all as read) або `null` при збої. */
async function countForDialog(
  target: MarkAllProps["target"],
): Promise<Found | null> {
  if (target === "read") {
    const result = await countUnreadAction();

    return result.ok ? { count: result.count, asOf: result.asOf } : null;
  }

  const result = await countReadAction();

  return result.ok ? { count: result.count, asOf: null } : null;
}

/**
 * Mark all as read у вкладці Unread і Mark all as unread у вкладці Read з
 * діалогом підтвердження (docs/ui.md, розділ 4.1) - дві дзеркальні загальні дії,
 * єдині дії над вакансіями з підтвердженням.
 *
 * Натискання бере з сервера кількість вакансій вкладки (усіх, не лише
 * завантажених у списку). Mark all as read бере ще й межу - час бази - і
 * позначає лише записані не пізніше неї: знайдені, поки діалог відкритий,
 * лишаються Unread (src/server/vacancies/README.md, «Одночасні зміни»). Mark
 * all as unread межі не має: у вкладку Read перевірка нічого не додає.
 *
 * `AlertDialog`, як у видаленні компанії: вікно вимагає рішення. Кнопка
 * підтвердження закриває його лише після успіху, а не натисканням.
 */
export function MarkAll({ target, onMarked }: MarkAllProps) {
  const t = useTranslations(
    target === "read" ? "JobsPage.markAllRead" : "JobsPage.markAllUnread",
  );
  const tCommon = useTranslations("Common");
  const showActionFailed = useActionFailedToast();
  const overlay = useOverlayState();
  const [found, setFound] = useState<Found | null>(null);
  const [isLoading, startLoading] = useTransition();
  const [isMarking, startMarking] = useTransition();

  const open = () => {
    startLoading(async () => {
      const result = await countForDialog(target);

      if (result === null) {
        showActionFailed();
        return;
      }

      // Позначати вже нічого - зробили в іншій вкладці браузера. Питати нема
      // про що, а список має це показати.
      if (result.count === 0) {
        onMarked();
        return;
      }

      setFound(result);
      overlay.open();
    });
  };

  const confirm = () => {
    if (found === null) return;

    startMarking(async () => {
      const result =
        found.asOf === null
          ? await markAllUnreadAction()
          : await markAllReadAction(found.asOf);

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
