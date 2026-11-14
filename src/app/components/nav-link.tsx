"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavLinkProps {
  href: string;
  label: string;
}

/**
 * Одне посилання головного меню. Клієнтський компонент тому, що поточний шлях
 * читається лише на клієнті: usePathname навмисно недоступний у серверних
 * компонентах, щоб стан layout зберігався між переходами.
 * https://nextjs.org/docs/app/api-reference/functions/use-pathname
 */
export function NavLink({ href, label }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={
        isActive
          ? "border-b-2 border-current py-2 text-sm font-medium"
          : "border-b-2 border-transparent py-2 text-sm text-gray-500 hover:text-current"
      }
    >
      {label}
    </Link>
  );
}
