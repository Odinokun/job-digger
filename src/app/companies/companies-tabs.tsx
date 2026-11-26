import Link from "next/link";

import type { CompaniesTab } from "@/lib/companies/company-list";

interface CompaniesTabsProps {
  current: CompaniesTab;
  label: string;
  counts: Record<CountKey, number>;
  labels: Record<CountKey, string>;
}

type CountKey = "tracked" | "notTracked" | "attention" | "all";

const TAB_LINKS = [
  { tab: "tracked", href: "/companies", key: "tracked" },
  { tab: "not-tracked", href: "/companies?tab=not-tracked", key: "notTracked" },
  { tab: "attention", href: "/companies?tab=attention", key: "attention" },
  { tab: "all", href: "/companies?tab=all", key: "all" },
] as const;

/**
 * The Tracked / Not tracked / Needs attention / All tabs.
 *
 * This is navigation between URLs, not a switch inside the page: the state lives
 * in the URL, so a tab can be reloaded and sent as a link, and the list stays a
 * server list. Hence `nav` + `aria-current`, not `role="tablist"` from HeroUI
 * Tabs - which would also make the page a client page.
 *
 * Needs attention (task 6.11) shows only when such companies exist or the tab is
 * open: normally it is not there at all. All lists every company with a name
 * search (task companies-search) and comes last, as on Jobs.
 */
export function CompaniesTabs({
  current,
  label,
  counts,
  labels,
}: CompaniesTabsProps) {
  return (
    // On a narrow screen the tabs do not wrap but scroll in their own strip (UI
    // audit, A1). The line under them is an inset shadow, not a border: the
    // scrolling container would clip an underline lying on a border.
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
            {/* The space is text, not padding: otherwise a screen reader runs
                the name and the number together ("Unread(12)"). */}{" "}
            <span className="text-muted">({counts[key]})</span>
          </Link>
        );
      })}
    </nav>
  );
}
