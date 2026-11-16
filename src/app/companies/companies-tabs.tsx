import Link from "next/link";

import type { CompaniesTab } from "@/lib/companies/company-list";

interface CompaniesTabsProps {
  current: CompaniesTab;
  label: string;
  counts: { tracked: number; notTracked: number };
  labels: { tracked: string; notTracked: string };
}

const TAB_LINKS = [
  { tab: "tracked", href: "/companies" },
  { tab: "not-tracked", href: "/companies?tab=not-tracked" },
] as const;

/**
 * Вкладки Tracked / Not tracked.
 *
 * Це навігація між адресами, а не перемикач усередині сторінки: стан живе в
 * URL, тому вкладку можна перезавантажити й надіслати посиланням, а список
 * лишається серверним. Тому `nav` + `aria-current`, а не `role="tablist"`
 * з HeroUI Tabs - той ще й зробив би сторінку клієнтською.
 */
export function CompaniesTabs({
  current,
  label,
  counts,
  labels,
}: CompaniesTabsProps) {
  return (
    <nav aria-label={label} className="flex gap-6 border-b">
      {TAB_LINKS.map(({ tab, href }) => {
        const isActive = tab === current;

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
            {tab === "tracked" ? labels.tracked : labels.notTracked}
            <span className="ml-1 text-muted">
              ({tab === "tracked" ? counts.tracked : counts.notTracked})
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
