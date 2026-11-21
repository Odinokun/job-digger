import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { CheckProgress } from "./check-progress";
import { MobileNav } from "./mobile-nav";
import { NavLink } from "./nav-link";
import { getAttentionCount, getUnreadCount } from "./header-counts";

// Порядок розділів фіксований і повторює docs/ui.md, розділ 4.
// Jobs живе в корені: він відкривається за замовчуванням.
const sections = [
  { href: "/", key: "jobs" },
  { href: "/companies", key: "companies" },
  { href: "/history", key: "history" },
  { href: "/settings", key: "settings" },
] as const;

export async function AppHeader() {
  const t = await getTranslations("Nav");
  const [unread, attention] = await Promise.all([
    getUnreadCount(),
    getAttentionCount(),
  ]);
  // Число біля пункту меню - лише коли воно не нуль: непрочитані біля Jobs,
  // компанії, що потребують уваги, біля Companies (задача 6.11).
  const counts: Partial<Record<(typeof sections)[number]["key"], number>> = {
    jobs: unread > 0 ? unread : undefined,
    companies: attention > 0 ? attention : undefined,
  };

  const items = sections.map((section) => ({
    href: section.href,
    label: t(section.key),
    count: counts[section.key],
    // Число біля Companies - окреме посилання одразу на Needs attention. Сама
    // назва веде, як завжди, на Tracked: інакше, поки є хоч одна сторінка, яку
    // ми не читаємо, Companies відкривався б не там, де додають компанії.
    countLink:
      section.key === "companies"
        ? {
            href: "/companies?tab=attention",
            label: t("attentionCount", { count: attention }),
          }
        : undefined,
  }));

  return (
    <header className="border-b">
      {/* Ширина збігається з `main` у layout.tsx: меню має стояти над вмістом,
          а не над іншою колонкою. */}
      <div className="mx-auto flex max-w-5xl items-center gap-8 px-6">
        {/* "Job Digger" - назва продукту, вона не перекладається. */}
        <Link
          href="/"
          className="py-3 font-brand text-xl font-semibold whitespace-nowrap"
        >
          Job Digger
        </Link>
        {/* Від ширини md - меню в шапці; на вужчому екрані воно не вміщується
            і ховається за бургер (аудит інтерфейсу, A1). */}
        <nav
          aria-label={t("ariaLabel")}
          className="hidden items-center gap-6 md:flex"
        >
          {items.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>
        <CheckProgress />
        <MobileNav label={t("menu")} items={items} />
      </div>
    </header>
  );
}
