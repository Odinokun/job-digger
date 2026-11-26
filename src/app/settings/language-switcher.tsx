"use client";

import { ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { isSupportedLocale, locales, type Locale } from "@/i18n/config";

import { setLocaleAction } from "./actions";

/**
 * Language names - each in its own language: a person who cannot read the
 * current UI language has to find theirs. So they are not translated.
 */
const LANGUAGE_NAMES: Record<Locale, string> = {
  en: "English",
  uk: "Українська",
};

interface LanguageSwitcherProps {
  /** The language the page was rendered in. */
  current: Locale;
}

/**
 * The UI language choice. The language lives in a cookie, like the theme
 * (`i18n/config.ts`), and the server renders the translations, so after the
 * cookie is written the page is re-read with `router.refresh()`.
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
