"use client";

import { toast } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useCallback } from "react";

/**
 * The notification about an unexpected action failure - shared by all forms.
 *
 * One text for all such failures: the user does not care whether the database
 * or a query failed, they can do the same thing either way - try again. The
 * details stay in the server log (`runAction` in `src/app/action-result.ts`).
 *
 * A hook, not a plain function, because the text comes from next-intl, which is
 * read only from React context.
 */
export function useActionFailedToast(): () => void {
  const t = useTranslations("Errors");

  return useCallback(() => {
    // The `toast` queue is global: `Toast.Provider` in the layout without the
    // `queue` prop takes exactly that one, so it can be shown from any component.
    toast.danger(t("actionFailed"));
  }, [t]);
}
