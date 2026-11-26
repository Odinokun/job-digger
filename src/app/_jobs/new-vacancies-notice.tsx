"use client";

import { Bell } from "@gravity-ui/icons";
import { toast } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

interface NewVacanciesNotice {
  /** How many new vacancies the fresh first batch has; 0 - no notification. */
  count: number;
  /** The whole fresh batch is new and more follow: the number is a lower bound. */
  hasMore: boolean;
  /** Show: put the fresh first batch in place of the current list. */
  onShow: () => void;
}

/**
 * The "N new vacancies" toast with a Show button on the Jobs page (task 4.13).
 *
 * The list does not reset itself: the user may be reading the rows, and new
 * ones must not move them. So while the new vacancies are not shown, the toast
 * stays without a timer, and with new findings its number updates in place
 * instead of adding notifications. When there is nothing new any more (Show,
 * switching to another tab), the toast closes.
 */
export function useNewVacanciesNotice({
  count,
  hasMore,
  onShow,
}: NewVacanciesNotice): void {
  const t = useTranslations("JobsPage.newVacancies");
  const toastId = useRef<string | null>(null);

  // Show calls the latest handler: the toast was created earlier, and its button
  // would otherwise hold the list as it was when the toast appeared.
  const latestOnShow = useRef(onShow);
  useEffect(() => {
    latestOnShow.current = onShow;
  });

  useEffect(() => {
    if (count === 0) {
      if (toastId.current !== null) {
        toast.close(toastId.current);
        toastId.current = null;
      }
      return;
    }

    const title = t(hasMore ? "titleAtLeast" : "title", { count });
    const options = {
      // A bell in the attention colour instead of the default "i" (src/app/README.md#ink-theme).
      indicator: <Bell className="text-highlight" />,
      timeout: 0,
      // The user closed it - the next change of the number shows the toast again.
      onClose: () => {
        toastId.current = null;
      },
      actionProps: {
        children: t("show"),
        onPress: () => latestOnShow.current(),
      },
    };

    // `update` returns an id: the same one, or that of a new toast if the old one
    // is no longer in the queue (node_modules/@heroui/react/dist/components/toast/toast-queue.js).
    toastId.current =
      toastId.current === null
        ? toast(title, options)
        : toast.update(toastId.current, title, options);
  }, [count, hasMore, t]);

  // The page was left - a notification about its list is no longer of use.
  useEffect(
    () => () => {
      if (toastId.current !== null) {
        toast.close(toastId.current);
        // Strict Mode in development removes and re-adds effects: without this the
        // repeated effect would update the already closed toast instead of a new one.
        toastId.current = null;
      }
    },
    [],
  );
}
