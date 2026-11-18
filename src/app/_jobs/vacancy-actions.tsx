"use client";

import { Check, Envelope, Star, StarFill } from "@gravity-ui/icons";
import { Button } from "@heroui/react";
import { useTranslations } from "next-intl";

import type {
  VacancyListItem,
  VacancyPatch,
} from "@/lib/vacancies/vacancy-list";

interface VacancyActionsProps {
  vacancy: VacancyListItem;
  /** Дія над рядком: застосовує її сторінка - одразу й оптимістично. */
  onMark: (patch: VacancyPatch) => void;
}

/**
 * Дії рядка Jobs (docs/ui.md, розділ 4.1): перемикачі Read і Favorite.
 *
 * Кнопки лише з іконкою, тож `aria-label` обовʼязковий - як у кнопок Edit і
 * Delete в картці компанії. Підпис каже, що станеться, а не який стан зараз:
 * «Mark as read» на непрочитаній. Стан і запит до сервера тримає
 * [`jobs-board.tsx`](./jobs-board.tsx): дія видна одразу й відкочується при
 * збої, тож окремого очікування в кнопці немає.
 *
 * Відкриття оригіналу - саме посилання в назві, і воно Read не змінює.
 */
export function VacancyActions({ vacancy, onMark }: VacancyActionsProps) {
  const t = useTranslations("JobsPage");

  return (
    <div className="flex items-center gap-1">
      <Button
        isIconOnly
        size="sm"
        variant="tertiary"
        aria-label={vacancy.isRead ? t("markAsUnread") : t("markAsRead")}
        onPress={() =>
          onMark({ id: vacancy.id, changes: { isRead: !vacancy.isRead } })
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
        onPress={() =>
          onMark({
            id: vacancy.id,
            changes: { isFavorite: !vacancy.isFavorite },
          })
        }
      >
        {vacancy.isFavorite ? <StarFill /> : <Star />}
      </Button>
    </div>
  );
}
