import { Toast } from "@heroui/react";
import type { Metadata } from "next";
import {
  Fraunces,
  IBM_Plex_Mono,
  Instrument_Sans,
  Space_Grotesk,
} from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";

import "./globals.css";
import { AppHeader } from "./components/app-header";
import { CheckStatusProvider } from "./components/check-status-provider";
import { CheckSummary } from "./components/check-summary";
import { getUnreadCount } from "./components/header-counts";
import { ThemeScript } from "./theme-script";

// The "Ink" theme: Instrument Sans for body text, Space Grotesk for headings and
// company names, Fraunces for the logo, IBM Plex Mono for addresses. The rejected
// candidates with exact values are in theme-candidates.md next to this file.
//
// There is no Cyrillic in subsets on purpose - the main version is English, and
// other locales will get their own family in a separate step if needed.
const appSans = Instrument_Sans({
  variable: "--font-app-sans",
  subsets: ["latin", "latin-ext"],
});

const appDisplay = Space_Grotesk({
  variable: "--font-app-display",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
});

// The logo has its own family: the "Job Digger" wordmark is the only place where
// a serif fits, while headings stay grotesque.
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

/**
 * The browser tab title with the unread count: "(12) Job Digger".
 * With nothing unread - just the app name.
 */
export async function generateMetadata(): Promise<Metadata> {
  const unread = await getUnreadCount();

  return {
    title: unread > 0 ? `(${unread}) Job Digger` : "Job Digger",
    description: "Career pages and vacancy monitoring",
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The request locale comes from `src/i18n/request.ts`. `lang` needs it for
  // screen readers and for correct hyphenation.
  const [locale, unread] = await Promise.all([getLocale(), getUnreadCount()]);

  return (
    <html
      lang={locale}
      // There is no `data-theme` here on purpose: `ThemeScript` owns the
      // attribute, not React. If the layout rendered it, every re-render after a
      // Server Action would put the attribute back to the server value and erase
      // the choice - on screen this looked like the theme flashing.
      //
      // Because of this the HTML on the client differs from the server's, and
      // React would warn about the mismatch: `suppressHydrationWarning` silences
      // that on exactly this element and does not apply to its children.
      suppressHydrationWarning
      className={`${appSans.variable} ${appDisplay.variable} ${appBrand.variable} ${appMono.variable}`}
    >
      {/* Always, not conditionally: React does not execute a tag that appears
          in the tree during a client render, and logs about it in the console. */}
      <head>
        <ThemeScript />
      </head>
      <body className="bg-background text-foreground">
        {/* Passes the locale and translations to client components; it inherits
            them from the server parent by itself, so no props are needed. */}
        <NextIntlClientProvider>
          {/* Both the header and the pages need the general check state, so the
              provider wraps both. */}
          <CheckStatusProvider initialUnread={unread}>
            <AppHeader />
            {/* 64rem is the stock max-w-5xl token. Companies go in one column,
                and at 80rem the vacancy rows and the History table stretched so
                far that the date and the buttons came loose from the title. The
                header keeps the same width. */}
            <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
            <CheckSummary />
          </CheckStatusProvider>
          {/* The notification region. Without the `queue` prop it takes the
              global queue - the same one `toast` writes to from any component. */}
          <Toast.Provider />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
