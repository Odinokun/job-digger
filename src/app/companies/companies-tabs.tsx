import Link from "next/link";

import type { CompaniesTab } from "@/lib/companies/company-list";

interface CompaniesTabsProps {
  current: CompaniesTab;
  label: string;
  counts: Record<CountKey, number>;
  labels: Record<CountKey, string>;
}

type CountKey = "tracked" | "notTracked" | "attention";

const TAB_LINKS = [
  { tab: "tracked", href: "/companies", key: "tracked" },
  { tab: "not-tracked", href: "/companies?tab=not-tracked", key: "notTracked" },
  { tab: "attention", href: "/companies?tab=attention", key: "attention" },
] as const;

/**
 * Вкладки Tracked / Not tracked.
 *
 * Це навігація між адресами, а не перемикач усередині сторінки: стан живе в
 * URL, тому вкладку можна перезавантажити й надіслати посиланням, а список
 * лишається серверним. Тому `nav` + `aria-current`, а не `role="tablist"`
 * з HeroUI Tabs - той ще й зробив би сторінку клієнтською.
 *
 * Needs attention (задача 6.11) показується, лише коли такі компанії є або
 * вкладка відкрита: у звичайному стані її немає зовсім.
 */
export function CompaniesTabs({
  current,
  label,
  counts,
  labels,
}: CompaniesTabsProps) {
  return (
    <nav aria-label={label} className="flex gap-6 border-b">
      {TAB_LINKS.map(({ tab, href, key }) => {
        const isActive = tab === current;

        if (tab === "attention" && counts.attention === 0 && !isActive) {
          return null;
        }

        return (
          <Link
            key={tab}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "-mb-px border-b-2 border-foreground py-2 text-sm font-medium"
                : "-mb-px border-b-2 border-transparent py-2 text-sm text-muted hover:text-foreground"
            }
          >
            {labels[key]}
            <span className="ml-1 text-muted">({counts[key]})</span>
          </Link>
        );
      })}
    </nav>
  );
}
