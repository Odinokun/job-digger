import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { NavLink } from "./nav-link";
import { getUnreadCount } from "./unread-count";

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
  const unread = await getUnreadCount();

  return (
    <header className="border-b">
      {/* Ширина збігається з `main` у layout.tsx: меню має стояти над вмістом,
          а не над іншою колонкою. */}
      <div className="mx-auto flex max-w-7xl items-center gap-8 px-6">
        {/* "Job Digger" - назва продукту, вона не перекладається. */}
        <Link href="/" className="py-3 font-brand text-xl font-semibold">
          Job Digger
        </Link>
        <nav aria-label={t("ariaLabel")} className="flex items-center gap-6">
          {sections.map((section) => (
            <NavLink
              key={section.href}
              href={section.href}
              label={t(section.key)}
              // Число непрочитаних - лише біля Jobs і лише коли воно не нуль.
              count={section.key === "jobs" && unread > 0 ? unread : undefined}
            />
          ))}
        </nav>
      </div>
    </header>
  );
}
