"use client";

import { toast } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useCallback } from "react";

import { keepRecentUndos } from "@/lib/vacancies/undo";

/**
 * Скільки висить сповіщення Undo (рішення автора 24.11.2026). Поки курсор чи
 * фокус над сповіщеннями, таймер стоїть: це робить сам регіон тостів React
 * Aria (`pauseAll` у `react-aria/dist/private/toast/useToastRegion.mjs`).
 */
const UNDO_TIMEOUT_MS = 8000;

/**
 * Ключі відкритих сповіщень Undo, від найстарішого. Спільні для всієї
 * сторінки, як і сама черга `toast`: інакше кожна вкладка Jobs рахувала б свої
 * три.
 */
let openUndos: string[] = [];

export interface UndoNotice {
  /** Яку дію можна скасувати: Mark as read чи Remove from Favorites. */
  action: "markedRead" | "removedFromFavorites";
  /** Назва вакансії - щоб було видно, що саме повернеться. */
  title: string;
  onUndo: () => void;
}

/**
 * Сповіщення з кнопкою Undo після дії над вакансією (задача
 * vacancy-undo-toast): 8 секунд, не більше трьох одночасно - четверте закриває
 * найстаріше. HeroUI `maxVisibleToasts` старих не закриває, а лише ховає в
 * стосі, тому зайві закриваємо самі (`keepRecentUndos`). Інші сповіщення
 * (помилки, «N new vacancies») в цей рахунок не входять.
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
