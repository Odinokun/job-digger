"use client";

import { Display, Moon, Sun } from "@gravity-ui/icons";
import { ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme";

import { setThemeAction } from "./actions";

interface ThemeSwitcherProps {
  /** Що лежить у cookie: його прочитав сервер у `layout.tsx`. */
  current: ThemePreference;
}

const ICONS = {
  light: Sun,
  dark: Moon,
  system: Display,
} as const;

/**
 * Вибір оформлення: Light, Dark або System.
 *
 * Перемикання робить дві різні речі. Вигляд міняє **клієнт** - ставить
 * `data-theme` на `<html>` одразу, тому тема перемикається без перезавантаження
 * й не чекає на мережу. Запамʼятовує вибір **сервер** - `setThemeAction` пише
 * cookie, щоб він пережив перезавантаження.
 *
 * Покладатися на перерендер кореневого layout тут не можна: атрибут стоїть на
 * `<html>`, і те, що `revalidate` його перепише, не гарантовано.
 *
 * `disallowEmptySelection` обовʼязковий: без нього HeroUI дозволяє зняти вибір
 * і лишити жодної кнопки натиснутою, а «ніякого оформлення» не буває.
 */
export function ThemeSwitcher({ current }: ThemeSwitcherProps) {
  const t = useTranslations("SettingsPage.appearance");
  // Вибір контрольований: показане значення має помінятися одразу, а не після
  // того, як сервер підтвердить запис cookie.
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

          // Ключі приходять як `Key`, тобто рядок або число: звужуємо до
          // відомих значень, щоб не покластися на збіг типів.
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

      <p className="text-sm text-muted">{t("systemHint")}</p>
    </div>
  );
}

/**
 * Ставить тему на `<html>` - те саме, що робить inline-скрипт при завантаженні.
 *
 * Для System атрибут не прибирається, а відразу замінюється на обчислений:
 * темні токени HeroUI живуть під `[data-theme="dark"]`, тож без атрибута
 * сторінка стала б світлою навіть при темній системі.
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
 * Чи просить операційна система темну тему.
 *
 * Питати `matchMedia` просто так не можна: сторінка в цей момент могла сама
 * оголосити схему - у темній темі це робить `color-scheme: dark` самого
 * HeroUI, - а браузери звітують `prefers-color-scheme` з урахуванням
 * оголошеної схеми. Тоді перехід Dark → System при світлій системі лишав би
 * темну тему, і навпаки.
 *
 * Тому на час читання схема явно оголошується як «підтримуємо обидві»
 * (`light dark`), і відповідь знову описує систему, а не сторінку. Читання
 * обчисленого стилю між записом і запитом змушує браузер перерахувати стилі
 * до того, як ми спитаємо.
 */
function systemPrefersDark(): boolean {
  const root = document.documentElement;
  const previous = root.style.colorScheme;

  root.style.colorScheme = "light dark";
  // Навмисне читання заради перерахунку стилів, результат не потрібен.
  void getComputedStyle(root).colorScheme;

  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  root.style.colorScheme = previous;

  return dark;
}
