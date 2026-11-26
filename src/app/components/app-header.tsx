import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { CheckProgress } from "./check-progress";
import { MobileNav } from "./mobile-nav";
import { NavLink } from "./nav-link";
import { getAttentionCount, getUnreadCount } from "./header-counts";

// The order of the sections is fixed (src/app/README.md, "Routes").
// Jobs lives at the root: it is the default page.
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
  // The number next to a menu item only when it is not zero: unread next to
  // Jobs, companies needing attention next to Companies (task 6.11).
  const counts: Partial<Record<(typeof sections)[number]["key"], number>> = {
    jobs: unread > 0 ? unread : undefined,
    companies: attention > 0 ? attention : undefined,
  };

  const items = sections.map((section) => ({
    href: section.href,
    label: t(section.key),
    count: counts[section.key],
    // The number next to Companies is a separate link straight to Needs
    // attention. The name itself leads to Tracked as usual: otherwise, as long as
    // any page went unread, Companies would open away from where companies are added.
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
      {/* The width matches `main` in layout.tsx: the menu has to stand above the
          content, not above another column. */}
      <div className="mx-auto flex max-w-5xl items-center gap-8 px-6">
        {/* "Job Digger" is the product name and is not translated. */}
        <Link
          href="/"
          className="py-3 font-brand text-xl font-semibold whitespace-nowrap"
        >
          Job Digger
        </Link>
        {/* From the md width the menu is in the header; on a narrower screen it
            does not fit and hides behind a burger (UI audit, A1). */}
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
