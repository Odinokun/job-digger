"use client";

import { toast } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useCallback } from "react";

/**
 * Сповіщення про неочікуваний збій дії - спільне для всіх форм.
 *
 * Текст один на всі такі збої: користувачеві байдуже, впала база чи запит, бо
 * зробити він може те саме - повторити. Деталі лишаються в лозі сервера
 * (`runAction` у `src/app/action-result.ts`).
 *
 * Хук, а не проста функція, бо текст приходить із next-intl, а той читається
 * лише з контексту React.
 */
export function useActionFailedToast(): () => void {
  const t = useTranslations("Errors");

  return useCallback(() => {
    // Черга в `toast` глобальна: `Toast.Provider` у layout без пропа `queue`
    // бере саме її, тому показувати можна з будь-якого компонента.
    toast.danger(t("actionFailed"));
  }, [t]);
}
