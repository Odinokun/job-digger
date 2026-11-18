"use client";

import { Check, Envelope, Star, StarFill } from "@gravity-ui/icons";
import { Button } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { useActionFailedToast } from "@/app/components/use-action-failed-toast";
import type { VacancyListItem } from "@/lib/vacancies/vacancy-list";

import {
  setVacancyFavoriteAction,
  setVacancyReadAction,
  type VacancyMarkResult,
} from "./actions";

interface VacancyActionsProps {
  vacancy: VacancyListItem;
  /** Рядок після дії або `null`, якщо вакансії вже немає. */
  onChanged: (vacancyId: string, changed: VacancyListItem | null) => void;
}

/**
 * Дії рядка Jobs (docs/ui.md, розділ 4.1): перемикачі Read і Favorite.
 *
 * Кнопки лише з іконкою, тож `aria-label` обовʼязковий - як у кнопок Edit і
 * Delete в картці компанії. Підпис каже, що станеться, а не який стан зараз:
 * «Mark as read» на непрочитаній. Поки дія йде, кнопка в `isPending`;
 * оптимістичне оновлення з відкатом - задача 3.21.
 *
 * Відкриття оригіналу - саме посилання в назві, і воно Read не змінює.
 */
export function VacancyActions({ vacancy, onChanged }: VacancyActionsProps) {
  const t = useTranslations("JobsPage");
  const showActionFailed = useActionFailedToast();
  const [isReadPending, startRead] = useTransition();
  const [isFavoritePending, startFavorite] = useTransition();

  function apply(result: VacancyMarkResult) {
    if (!result.ok) {
      showActionFailed();
      return;
    }

    onChanged(vacancy.id, result.vacancy);
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        isIconOnly
        size="sm"
        variant="tertiary"
        aria-label={vacancy.isRead ? t("markAsUnread") : t("markAsRead")}
        isPending={isReadPending}
        onPress={() =>
          startRead(async () => {
            apply(await setVacancyReadAction(vacancy.id, !vacancy.isRead));
          })
        }
      >
        {vacancy.isRead ? <Envelope /> : <Check />}
      </Button>
      <Button
        isIconOnly
        size="sm"
        variant="tertiary"
        // Без `aria-pressed`: підпис уже змінюється разом зі станом, і читач
        // екрана почув би стан двічі. Зрячому стан показує заповнена зірка.
        aria-label={vacancy.isFavorite ? t("unfavorite") : t("favorite")}
        isPending={isFavoritePending}
        onPress={() =>
          startFavorite(async () => {
            apply(
              await setVacancyFavoriteAction(vacancy.id, !vacancy.isFavorite),
            );
          })
        }
      >
        {vacancy.isFavorite ? <StarFill /> : <Star />}
      </Button>
    </div>
  );
}
