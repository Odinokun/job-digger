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
 *
 * Біля назви - кількість рядків вкладки, як на Companies: Unread і All разом
 * кажуть, скільки непрочитано з усіх знайдених (задача jobs-tab-counts).
 * Компонент без стану, тож його рендерить і клієнтський `JobsBoard`: числа
 * там поправлені на дії, що ще тривають.
 */
export function JobsTabs({ current, label, labels, counts }: JobsTabsProps) {
  return (
    // На вузькому екрані вкладки не переносяться, а прокручуються в своїй
    // смузі (аудит інтерфейсу, A1). Лінія під ними - тінь inset, а не border:
    // прокручуваний контейнер обрізав би підкреслення, що лягає на border.
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
          {/* Пробіл - текстом, а не відступом: інакше назва для читача
                екрана злипається з числом («Unread(12)»). */}{" "}
          <span className="text-muted">({counts[tab]})</span>
        </Link>
      ))}
    </nav>
  );
}
