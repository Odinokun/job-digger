import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";

import { isSupportedLocale, defaultLocale } from "@/i18n/config";
import { parseThemePreference, THEME_COOKIE_NAME } from "@/lib/theme";
import { getDb } from "@/server/db/client";
import { getSystemUser } from "@/server/db/system-user";
import { getSettings } from "@/server/settings/settings";

import { AutoCheckIntervalPicker } from "./auto-check-interval-picker";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeSwitcher } from "./theme-switcher";

export default async function SettingsPage() {
  const t = await getTranslations("SettingsPage");

  // Ту саму cookie читає `layout.tsx`, щоб поставити тему в SSR. Тут вона
  // потрібна лише для того, щоб перемикач відкрився на поточному значенні.
  const theme = parseThemePreference(
    (await cookies()).get(THEME_COOKIE_NAME)?.value,
  );

  const locale = await getLocale();
  const db = getDb();
  const settings = await getSettings(db, (await getSystemUser(db)).id);

  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        {t("title")}
      </h1>

      <section className="mt-8 flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {t("appearance.title")}
        </h2>
        <ThemeSwitcher current={theme} />
      </section>

      <section className="mt-8 flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {t("language.title")}
        </h2>
        <LanguageSwitcher
          // `getLocale` віддає те, що вирішив `i18n/request.ts`, - рядок, а
          // перемикачу потрібна одна з відомих мов.
          current={isSupportedLocale(locale) ? locale : defaultLocale}
        />
      </section>

      <section className="mt-8 flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {t("autoCheck.title")}
        </h2>
        <AutoCheckIntervalPicker current={settings.autoCheckIntervalHours} />
      </section>
    </>
  );
}
