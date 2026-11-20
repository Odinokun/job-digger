"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavLinkProps {
  href: string;
  label: string;
  /**
   * Число біля назви - кольором `counter`, без заливки (src/app/README.md#тема-ink). Текст
   * посилання - «Jobs 12»: пробіл тримає назву й число окремими словами для
   * читача екрана.
   */
  count?: number;
  /**
   * Число як окреме посилання - туди, де воно рахується (Companies → Needs
   * attention, задача 6.11). `label` - повний текст для читача екрана: саме
   * число без контексту нічого не каже.
   */
  countLink?: { href: string; label: string };
}

/**
 * Одне посилання головного меню. Клієнтський компонент тому, що поточний шлях
 * читається лише на клієнті: usePathname навмисно недоступний у серверних
 * компонентах, щоб стан layout зберігався між переходами.
 * https://nextjs.org/docs/app/api-reference/functions/use-pathname
 */
export function NavLink({ href, label, count, countLink }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href;
  const className = isActive
    ? "border-b-2 border-foreground py-2 text-sm font-medium"
    : "border-b-2 border-transparent py-2 text-sm text-muted hover:text-foreground";
  const number =
    count === undefined ? null : (
      <span className="font-semibold text-counter tabular-nums">{count}</span>
    );

  if (number !== null && countLink !== undefined) {
    // Два посилання поруч, а не одне в іншому: вкладені `<a>` HTML забороняє.
    return (
      <span className="flex items-baseline gap-1">
        <Link
          href={href}
          aria-current={isActive ? "page" : undefined}
          className={className}
        >
          {label}
        </Link>
        <Link
          href={countLink.href}
          aria-label={countLink.label}
          className="py-2 text-sm hover:underline"
        >
          {number}
        </Link>
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={className}
    >
      {label}
      {number === null ? null : <> {number}</>}
    </Link>
  );
}
