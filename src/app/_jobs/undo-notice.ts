"use client";

import { toast } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useCallback } from "react";

import { keepRecentUndos } from "@/lib/vacancies/undo";

/**
 * How long the Undo notification stays. While the pointer or focus is on the
 * notifications, the timer stops: the React Aria toast region does that itself
 * (`pauseAll` in `react-aria/dist/private/toast/useToastRegion.mjs`).
 */
const UNDO_TIMEOUT_MS = 8000;

/**
 * The keys of the open Undo notifications, oldest first. Shared by the whole
 * page, like the `toast` queue itself: otherwise every Jobs tab would count its
 * own three.
 */
let openUndos: string[] = [];

export interface UndoNotice {
  /** Which action can be undone: Mark as read or Remove from Favorites. */
  action: "markedRead" | "removedFromFavorites";
  /** The vacancy title - so it is clear what comes back. */
  title: string;
  onUndo: () => void;
}

/**
 * A notification with an Undo button after an action on a vacancy (task
 * vacancy-undo-toast): 8 seconds, at most three at once - a fourth closes the
 * oldest. HeroUI `maxVisibleToasts` does not close old ones but only hides them
 * in the stack, so we close the extra ones ourselves (`keepRecentUndos`). Other
 * notifications (errors, "N new vacancies") do not count towards this.
 */
export function useUndoNotice(): (notice: UndoNotice) => void {
  const t = useTranslations("JobsPage");

  return useCallback(
    ({ action, title, onUndo }: UndoNotice) => {
      const key = toast(t(action), {
        description: title,
        timeout: UNDO_TIMEOUT_MS,
        onClose: () => {
          openUndos = openUndos.filter((open) => open !== key);
        },
        actionProps: {
          children: t("undo"),
          onPress: () => {
            toast.close(key);
            onUndo();
          },
        },
      });

      const { open, toClose } = keepRecentUndos(openUndos, key);
      openUndos = open;
      toClose.forEach((old) => toast.close(old));
    },
    [t],
  );
}
