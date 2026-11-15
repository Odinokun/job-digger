import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import "./globals.css";
import { AppHeader } from "./components/app-header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Job Digger",
  description: "Career pages and vacancy monitoring",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Мова запиту - з `src/i18n/request.ts`. У `lang` вона потрібна для
  // читалок екрана й правильного перенесення слів.
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="bg-background text-foreground">
        {/* Передає локаль і переклади в клієнтські компоненти; від серверного
            батька він успадковує їх сам, тому пропи не потрібні. */}
        <NextIntlClientProvider>
          <AppHeader />
          <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
