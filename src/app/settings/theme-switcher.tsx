"use client";

import { Display, Moon, Sun } from "@gravity-ui/icons";
import { ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme";

import { setThemeAction } from "./actions";

interface ThemeSwitcherProps {
  /** What the cookie holds: the server read it in `layout.tsx`. */
  current: ThemePreference;
}

const ICONS = {
  light: Sun,
  dark: Moon,
  system: Display,
} as const;

/**
 * The theme choice: Light, Dark or System.
 *
 * Switching does two different things. The **client** changes the look - it
 * sets `data-theme` on `<html>` at once, so the theme switches without a reload
 * and does not wait for the network. The **server** remembers the choice -
 * `setThemeAction` writes the cookie so that it survives a reload.
 *
 * Relying on a re-render of the root layout is not an option here: the attribute
 * is on `<html>`, and there is no guarantee that `revalidate` rewrites it.
 *
 * `disallowEmptySelection` is required: without it HeroUI lets the selection be
 * cleared, leaving no button pressed, and there is no such thing as "no theme".
 */
export function ThemeSwitcher({ current }: ThemeSwitcherProps) {
  const t = useTranslations("SettingsPage.appearance");
  // The choice is controlled: the shown value has to change at once, not after
  // the server confirms the cookie write.
  const [selected, setSelected] = useState<ThemePreference>(current);
  const [, startSaving] = useTransition();

  function choose(preference: ThemePreference) {
    setSelected(preference);
    applyTheme(preference);
    startSaving(async () => {
      await setThemeAction(preference);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <ToggleButtonGroup
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={new Set([selected])}
        onSelectionChange={(keys) => {
          const [first] = [...keys];

          // Keys arrive as `Key`, that is a string or a number: narrow them to the
          // known values instead of relying on the types matching.
          if (
            typeof first === "string" &&
            THEME_PREFERENCES.includes(first as ThemePreference)
          ) {
            choose(first as ThemePreference);
          }
        }}
        aria-label={t("label")}
      >
        {THEME_PREFERENCES.map((preference, index) => {
          const Icon = ICONS[preference];

          return (
            <ToggleButton key={preference} id={preference}>
              {index > 0 ? <ToggleButtonGroup.Separator /> : null}
              <Icon />
              {t(preference)}
            </ToggleButton>
          );
        })}
      </ToggleButtonGroup>

      <p className="text-hint text-muted">{t("systemHint")}</p>
    </div>
  );
}

/**
 * Sets the theme on `<html>` - the same as the inline script does on load.
 *
 * For System the attribute is not removed but replaced at once with the
 * computed one: HeroUI's dark tokens live under `[data-theme="dark"]`, so
 * without the attribute the page would turn light even on a dark system.
 */
function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;

  root.dataset.theme =
    preference === "system"
      ? systemPrefersDark()
        ? "dark"
        : "light"
      : preference;
}

/**
 * Whether the operating system asks for the dark theme.
 *
 * `matchMedia` cannot simply be asked: at that moment the page may have declared
 * a scheme itself - in the dark theme HeroUI's own `color-scheme: dark` does
 * that - and browsers report `prefers-color-scheme` taking the declared scheme
 * into account. Then switching Dark → System on a light system would keep the
 * dark theme, and the other way round.
 *
 * So for the duration of the read the scheme is explicitly declared as "we
 * support both" (`light dark`), and the answer describes the system again, not
 * the page. Reading the computed style between the write and the query makes
 * the browser recalculate styles before we ask.
 */
function systemPrefersDark(): boolean {
  const root = document.documentElement;
  const previous = root.style.colorScheme;

  root.style.colorScheme = "light dark";
  // A deliberate read to force a style recalculation; the result is not needed.
  void getComputedStyle(root).colorScheme;

  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  root.style.colorScheme = previous;

  return dark;
}
