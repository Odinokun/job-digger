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
   * `read` - Mark all as read in the Unread tab, `unread` - Mark all as unread
   * in the Read tab (task 6.18).
   */
  target: "read" | "unread";
  /** The vacancies that were in the list are no longer in the tab: the list empties. */
  onMarked: () => void;
}

/** What the dialog takes from the server: a number, and for Mark all as read also the boundary. */
type Found = { count: number; asOf: string | null };

/** The number for the dialog (and the boundary for Mark all as read), or `null` on failure. */
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
 * Mark all as read in the Unread tab and Mark all as unread in the Read tab,
 * with a confirmation dialog - two mirrored bulk actions, the only actions on
 * vacancies that ask for confirmation.
 *
 * The click takes the number of vacancies in the tab from the server (all of
 * them, not only those loaded in the list). Mark all as read also takes the
 * boundary - the database time - and marks only those recorded up to it:
 * vacancies found while the dialog is open stay Unread
 * (src/server/vacancies/README.md, "Concurrent changes"). Mark all as unread has no
 * boundary: a check never adds anything to the Read tab.
 *
 * An `AlertDialog`, as for deleting a company: the window demands a decision.
 * The confirm button closes it only after success, not on the click.
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

      // Nothing left to mark - it was done in another browser tab. There is
      // nothing to ask, and the list has to show that.
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
