import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";

import { isSupportedLocale, defaultLocale } from "@/i18n/config";
import { parseThemePreference, THEME_COOKIE_NAME } from "@/lib/theme";
import { getDb } from "@/server/db/client";
import { getSystemUser } from "@/server/db/system-user";
import { getSettings } from "@/server/settings/settings";

import { AutoCheckIntervalPicker } from "./auto-check-interval-picker";
import { CsvExport } from "./csv-export";
import { CsvImport } from "./csv-import";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeSwitcher } from "./theme-switcher";

export default async function SettingsPage() {
  const t = await getTranslations("SettingsPage");

  // `layout.tsx` reads the same cookie to set the theme in SSR. Here it is needed
  // only so the switch opens on the current value.
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
          // `getLocale` returns what `i18n/request.ts` decided - a string, while
          // the switch needs one of the known languages.
          current={isSupportedLocale(locale) ? locale : defaultLocale}
        />
      </section>

      <section className="mt-8 flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {t("autoCheck.title")}
        </h2>
        <AutoCheckIntervalPicker current={settings.autoCheckIntervalHours} />
      </section>

      <section className="mt-8 flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {t("export.title")}
        </h2>
        <CsvExport />
      </section>

      <section className="mt-8 flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {t("import.title")}
        </h2>
        <CsvImport />
      </section>
    </>
  );
}
