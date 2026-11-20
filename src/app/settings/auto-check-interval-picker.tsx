"use client";

import { ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { useActionFailedToast } from "@/app/components/use-action-failed-toast";
import {
  AUTO_CHECK_INTERVALS,
  parseAutoCheckInterval,
  type AutoCheckInterval,
} from "@/lib/settings/auto-check-interval";

import { setAutoCheckIntervalAction } from "./actions";

interface AutoCheckIntervalPickerProps {
  /** Що збережено в базі або значення за замовчуванням. */
  current: AutoCheckInterval;
}

/**
 * Вибір інтервалу автоматичної перевірки: 3, 6, 12 або 24 години (docs/ui.md,
 * розділ 4.5).
 *
 * Оптимістично, як і тема: вибір видно одразу, а якщо сервер не зберіг -
 * повертається попередній і показується toast.
 */
export function AutoCheckIntervalPicker({
  current,
}: AutoCheckIntervalPickerProps) {
  const t = useTranslations("SettingsPage.autoCheck");
  const showActionFailed = useActionFailedToast();
  const [selected, setSelected] = useState<AutoCheckInterval>(current);
  const [, startSaving] = useTransition();

  function choose(hours: AutoCheckInterval) {
    const previous = selected;
    setSelected(hours);
    startSaving(async () => {
      const result = await setAutoCheckIntervalAction(hours);

      if (!result.ok) {
        setSelected(previous);
        showActionFailed();
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <ToggleButtonGroup
        selectionMode="single"
        // Без цього HeroUI дозволяє зняти вибір, а «без інтервалу» не буває.
        disallowEmptySelection
        selectedKeys={new Set([String(selected)])}
        onSelectionChange={(keys) => {
          const [first] = [...keys];
          const hours = parseAutoCheckInterval(first);

          if (hours !== null) {
            choose(hours);
          }
        }}
        aria-label={t("label")}
      >
        {AUTO_CHECK_INTERVALS.map((hours, index) => (
          <ToggleButton key={hours} id={String(hours)}>
            {index > 0 ? <ToggleButtonGroup.Separator /> : null}
            {t("hours", { hours })}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <p className="text-sm text-muted">{t("hint")}</p>
    </div>
  );
}
