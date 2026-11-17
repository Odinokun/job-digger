import { Toast } from "@heroui/react";
import type { Metadata } from "next";
import {
  Fraunces,
  IBM_Plex_Mono,
  Instrument_Sans,
  Space_Grotesk,
} from "next/font/google";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";

import { parseThemePreference, THEME_COOKIE_NAME } from "@/lib/theme";

import "./globals.css";
import { AppHeader } from "./components/app-header";
import { ThemeScript } from "./theme-script";

// Тема «Ink»: Instrument Sans у тілі, Space Grotesk на заголовках і назвах
// компаній, Fraunces на логотипі, IBM Plex Mono на адресах. Відхилені кандидати
// з точними значеннями - у theme-candidates.md поруч.
//
// Кирилиці в subsets немає свідомо - основна версія англійська, інші локалі за
// потреби отримають власне сімейство окремим кроком.
const appSans = Instrument_Sans({
  variable: "--font-app-sans",
  subsets: ["latin", "latin-ext"],
});

const appDisplay = Space_Grotesk({
  variable: "--font-app-display",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
});

// Логотип має власне сімейство: напис «Job Digger» - єдине місце, де серіф
// доречний, а заголовки лишаються гротеском.
const appBrand = Fraunces({
  variable: "--font-app-brand",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "700"],
});

const appMono = IBM_Plex_Mono({
  variable: "--font-app-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Job Digger",
  description: "Career pages and vacancy monitoring",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Мова запиту - з `src/i18n/request.ts`. У `lang` вона потрібна для
  // читалок екрана й правильного перенесення слів.
  const locale = await getLocale();

  // Оформлення - теж cookie, як і мова. Явний вибір сервер ставить одразу в
  // HTML, тому темна тема не мигає світлою на першому фарбуванні.
  const theme = parseThemePreference(
    (await cookies()).get(THEME_COOKIE_NAME)?.value,
  );

  return (
    <html
      lang={locale}
      // Для System атрибута немає: системну тему знає лише браузер, і її
      // проставляє `ThemeScript` до першого фарбування. Через це HTML на
      // клієнті відрізняється від серверного, і React попереджав би про
      // розбіжність - `suppressHydrationWarning` глушить це рівно тут і на
      // дітей не поширюється.
      data-theme={theme === "system" ? undefined : theme}
      suppressHydrationWarning
      className={`${appSans.variable} ${appDisplay.variable} ${appBrand.variable} ${appMono.variable}`}
    >
      {theme === "system" ? (
        <head>
          <ThemeScript />
        </head>
      ) : null}
      <body className="bg-background text-foreground">
        {/* Передає локаль і переклади в клієнтські компоненти; від серверного
            батька він успадковує їх сам, тому пропи не потрібні. */}
        <NextIntlClientProvider>
          <AppHeader />
          {/* 80rem - стоковий токен max-w-7xl. Саме токен, а не власне число:
              перевизначати --container-5xl не стали, бо тоді клас max-w-5xl
              означав би не 5xl. Хедер тримає ту саму ширину. */}
          <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
          {/* Регіон сповіщень. Без пропа `queue` він бере глобальну чергу -
              ту саму, у яку пише `toast` із будь-якого компонента. */}
          <Toast.Provider />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
