import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { parseThemePreference, THEME_COOKIE_NAME } from "@/lib/theme";

import { ThemeSwitcher } from "./theme-switcher";

export default async function SettingsPage() {
  const t = await getTranslations("SettingsPage");

  // Ту саму cookie читає `layout.tsx`, щоб поставити тему в SSR. Тут вона
  // потрібна лише для того, щоб перемикач відкрився на поточному значенні.
  const theme = parseThemePreference(
    (await cookies()).get(THEME_COOKIE_NAME)?.value,
  );

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
    </>
  );
}
