"use client";

import { ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { isSupportedLocale, locales, type Locale } from "@/i18n/config";

import { setLocaleAction } from "./actions";

/**
 * Назви мов - кожна своєю мовою: людина, яка не читає поточну мову
 * інтерфейсу, має знайти свою. Тому вони не перекладаються.
 */
const LANGUAGE_NAMES: Record<Locale, string> = {
  en: "English",
  uk: "Українська",
};

interface LanguageSwitcherProps {
  /** Мова, якою відрендерено сторінку. */
  current: Locale;
}

/**
 * Вибір мови інтерфейсу. Мова - у cookie, як і тема (`i18n/config.ts`), а
 * переклади рендерить сервер, тож після запису cookie сторінка перечитується
 * через `router.refresh()`.
 */
export function LanguageSwitcher({ current }: LanguageSwitcherProps) {
  const t = useTranslations("SettingsPage.language");
  const router = useRouter();
  const [selected, setSelected] = useState<Locale>(current);
  const [, startSaving] = useTransition();

  function choose(locale: Locale) {
    setSelected(locale);
    startSaving(async () => {
      await setLocaleAction(locale);
      router.refresh();
    });
  }

  return (
    <ToggleButtonGroup
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={new Set([selected])}
      onSelectionChange={(keys) => {
        const [first] = [...keys];

        if (isSupportedLocale(first)) {
          choose(first);
        }
      }}
      aria-label={t("label")}
    >
      {locales.map((locale, index) => (
        <ToggleButton key={locale} id={locale} lang={locale}>
          {index > 0 ? <ToggleButtonGroup.Separator /> : null}
          {LANGUAGE_NAMES[locale]}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
