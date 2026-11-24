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
    // На вузькому екрані вкладки не переносяться, а прокручуються в своїй
    // смузі (аудит інтерфейсу, A1). Лінія під ними - тінь inset, а не border:
    // прокручуваний контейнер обрізав би підкреслення, що лягає на border.
    <nav
      aria-label={label}
      className="flex [scrollbar-width:none] gap-4 overflow-x-auto shadow-[inset_0_-1px_0_var(--border)] sm:gap-6"
    >
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
                ? "shrink-0 border-b-2 border-foreground py-2 text-sm font-medium whitespace-nowrap"
                : "shrink-0 border-b-2 border-transparent py-2 text-sm whitespace-nowrap text-muted hover:text-foreground"
            }
          >
            {labels[key]}
            {/* Пробіл - текстом, а не відступом: інакше назва для читача
                екрана злипається з числом («Unread(12)»). */}{" "}
            <span className="text-muted">({counts[key]})</span>
          </Link>
        );
      })}
    </nav>
  );
}
