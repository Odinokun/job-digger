"use client";

import { Check, Envelope, Star, StarFill } from "@gravity-ui/icons";
import { useTranslations } from "next-intl";

import { IconButton } from "@/app/components/icon-button";

import type {
  VacancyListItem,
  VacancyPatch,
} from "@/lib/vacancies/vacancy-list";

interface VacancyActionsProps {
  vacancy: VacancyListItem;
  /** An action on the row: the page applies it - at once and optimistically. */
  onMark: (patch: VacancyPatch) => void;
}

/**
 * The Jobs row actions: the Read and Favorite toggles.
 *
 * Icon-only buttons are `IconButton`, with a tooltip on hover. The label says
 * what will happen, not the current state: "Mark as read" on an unread one.
 * [`jobs-board.tsx`](./jobs-board.tsx) holds the state and the server request:
 * the action shows at once and rolls back on failure, so the button has no
 * waiting state of its own.
 *
 * Opening the original is the link in the title itself, and it does not change Read.
 */
export function VacancyActions({ vacancy, onMark }: VacancyActionsProps) {
  const t = useTranslations("JobsPage");

  return (
    <div className="flex items-center gap-1">
      <IconButton
        size="sm"
        variant="tertiary"
        label={vacancy.isRead ? t("markAsUnread") : t("markAsRead")}
        onPress={() =>
          onMark({ id: vacancy.id, changes: { isRead: !vacancy.isRead } })
        }
      >
        {vacancy.isRead ? <Envelope /> : <Check />}
      </IconButton>
      <IconButton
        size="sm"
        variant="tertiary"
        // No `aria-pressed`: the label already changes with the state, and a
        // screen reader would hear the state twice. A sighted user sees it from
        // the filled star.
        label={vacancy.isFavorite ? t("unfavorite") : t("favorite")}
        onPress={() =>
          onMark({
            id: vacancy.id,
            changes: { isFavorite: !vacancy.isFavorite },
          })
        }
      >
        {/* A favorite is in the attention colour (src/app/README.md#ink-theme). */}
        {vacancy.isFavorite ? (
          <StarFill className="text-attention" />
        ) : (
          <Star />
        )}
      </IconButton>
    </div>
  );
}
