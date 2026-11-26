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
  /** What the database holds, or the default value. */
  current: AutoCheckInterval;
}

/**
 * The auto-check interval choice: 3, 6, 12 or 24 hours.
 *
 * Optimistic, like the theme: the choice shows at once, and if the server did
 * not save it, the previous one comes back and a toast appears.
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
        // Without this HeroUI lets the selection be cleared, and there is no "no interval".
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

      <p className="text-hint text-muted">{t("hint")}</p>
    </div>
  );
}
