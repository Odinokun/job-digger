"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavLinkProps {
  href: string;
  label: string;
  /**
   * Число біля назви - бейдж кольору уваги (src/app/README.md#тема-ink). Текст
   * посилання - «Jobs 12»: пробіл тримає назву й число окремими словами для
   * читача екрана.
   */
  count?: number;
}

/**
 * Одне посилання головного меню. Клієнтський компонент тому, що поточний шлях
 * читається лише на клієнті: usePathname навмисно недоступний у серверних
 * компонентах, щоб стан layout зберігався між переходами.
 * https://nextjs.org/docs/app/api-reference/functions/use-pathname
 */
export function NavLink({ href, label, count }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={
        isActive
          ? "border-b-2 border-foreground py-2 text-sm font-medium"
          : "border-b-2 border-transparent py-2 text-sm text-muted hover:text-foreground"
      }
    >
      {label}
      {count === undefined ? null : (
        <>
          {" "}
          <span className="rounded-sm bg-highlight px-1.5 py-0.5 text-xs font-semibold text-highlight-foreground tabular-nums">
            {count}
          </span>
        </>
      )}
    </Link>
  );
}
