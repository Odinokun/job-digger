import Link from "next/link";

import {
  JOBS_TABS,
  type JobsTab,
  type JobsTabCounts,
} from "@/lib/vacancies/vacancy-list";

interface JobsTabsProps {
  current: JobsTab;
  label: string;
  labels: Record<JobsTab, string>;
  counts: JobsTabCounts;
}

/** Unread is the address without a parameter: that is what opens by default. */
function hrefOf(tab: JobsTab): string {
  return tab === "unread" ? "/" : `/?tab=${tab}`;
}

/**
 * The Unread / Read / Favorites / All tabs in a fixed order.
 *
 * Navigation between URLs, like the Companies tabs
 * ([`companies-tabs.tsx`](../companies/companies-tabs.tsx)): a tab can be
 * reloaded and sent as a link, and the page stays a server page.
 *
 * Next to the name - the tab's row count, as on Companies: Unread and All
 * together tell how many of all found vacancies are unread (task
 * jobs-tab-counts). The component is stateless, so the client `JobsBoard`
 * renders it too: the numbers there are adjusted for actions still running.
 */
export function JobsTabs({ current, label, labels, counts }: JobsTabsProps) {
  return (
    // On a narrow screen the tabs do not wrap but scroll in their own strip (UI
    // audit, A1). The line under them is an inset shadow, not a border: the
    // scrolling container would clip an underline lying on a border.
    <nav
      aria-label={label}
      className="flex [scrollbar-width:none] gap-4 overflow-x-auto shadow-[inset_0_-1px_0_var(--border)] sm:gap-6"
    >
      {JOBS_TABS.map((tab) => (
        <Link
          key={tab}
          href={hrefOf(tab)}
          aria-current={tab === current ? "page" : undefined}
          className={
            tab === current
              ? "shrink-0 border-b-2 border-foreground py-2 text-sm font-medium whitespace-nowrap"
              : "shrink-0 border-b-2 border-transparent py-2 text-sm whitespace-nowrap text-muted hover:text-foreground"
          }
        >
          {labels[tab]}
          {/* The space is text, not padding: otherwise a screen reader runs the
                name and the number together ("Unread(12)"). */}{" "}
          <span className="text-muted">({counts[tab]})</span>
        </Link>
      ))}
    </nav>
  );
}
