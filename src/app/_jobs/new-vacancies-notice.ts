"use client";

import { toast } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

interface NewVacanciesNotice {
  /** Скільки нових вакансій у свіжій першій порції; 0 - сповіщення немає. */
  count: number;
  /** Уся свіжа порція нова, а за нею є ще: число - нижня межа. */
  hasMore: boolean;
  /** Show: показати свіжу першу порцію замість поточного списку. */
  onShow: () => void;
}

/**
 * Toast «N new vacancies» із кнопкою Show на сторінці Jobs (задача 4.13).
 *
 * Список не скидається сам: користувач може саме читати рядки, і нові не
 * мають їх зсувати. Тож поки нові вакансії не показані, toast висить без
 * таймера, а з новими знахідками число в ньому оновлюється на місці, а не
 * множить сповіщення. Коли нових більше немає (Show, перехід на іншу вкладку),
 * toast закривається.
 */
export function useNewVacanciesNotice({
  count,
  hasMore,
  onShow,
}: NewVacanciesNotice): void {
  const t = useTranslations("JobsPage.newVacancies");
  const toastId = useRef<string | null>(null);

  // Show кличе найсвіжіший обробник: toast створено раніше, і його кнопка
  // інакше тримала б список, який був на момент показу.
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
      timeout: 0,
      // Закрив сам користувач - наступна зміна числа покаже toast знову.
      onClose: () => {
        toastId.current = null;
      },
      actionProps: {
        children: t("show"),
        onPress: () => latestOnShow.current(),
      },
    };

    // `update` повертає id: той самий або нового toast, якщо старого вже
    // немає в черзі (node_modules/@heroui/react/dist/components/toast/toast-queue.js).
    toastId.current =
      toastId.current === null
        ? toast(title, options)
        : toast.update(toastId.current, title, options);
  }, [count, hasMore, t]);

  // Сторінку покинули - сповіщення про її список більше ні до чого.
  useEffect(
    () => () => {
      if (toastId.current !== null) {
        toast.close(toastId.current);
        // Strict Mode у розробці знімає й ставить ефекти ще раз: без цього
        // повторний ефект оновлював би вже закритий toast замість нового.
        toastId.current = null;
      }
    },
    [],
  );
}
