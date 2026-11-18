import Link from "next/link";

import { JOBS_TABS, type JobsTab } from "@/lib/vacancies/vacancy-list";

interface JobsTabsProps {
  current: JobsTab;
  label: string;
  labels: Record<JobsTab, string>;
}

/** Unread - адреса без параметра: саме вона відкривається за замовчуванням. */
function hrefOf(tab: JobsTab): string {
  return tab === "unread" ? "/" : `/?tab=${tab}`;
}

/**
 * Вкладки Unread / Read / Favorites / All у фіксованому порядку
 * (docs/ui.md, розділ 4.1).
 *
 * Навігація між адресами, як вкладки Companies
 * ([`companies-tabs.tsx`](../companies/companies-tabs.tsx)): вкладку можна
 * перезавантажити й надіслати посиланням, а сторінка лишається серверною.
 * Лічильника в назвах немає - число непрочитаних стоїть у меню (задача 3.19).
 */
export function JobsTabs({ current, label, labels }: JobsTabsProps) {
  return (
    <nav aria-label={label} className="flex gap-6 border-b">
      {JOBS_TABS.map((tab) => (
        <Link
          key={tab}
          href={hrefOf(tab)}
          aria-current={tab === current ? "page" : undefined}
          className={
            tab === current
              ? "-mb-px border-b-2 border-foreground py-2 text-sm font-medium"
              : "-mb-px border-b-2 border-transparent py-2 text-sm text-muted hover:text-foreground"
          }
        >
          {labels[tab]}
        </Link>
      ))}
    </nav>
  );
}
