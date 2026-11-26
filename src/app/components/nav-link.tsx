"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavLinkProps {
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
  /**
   * `bar` - у шапці, підкреслення активного знизу; `list` - рядок у бургер-меню
   * на вузькому екрані (`mobile-nav.tsx`), крупніший і з більшою зоною дотику.
   */
  layout?: "bar" | "list";
  /** Перехід за посиланням: бургер-меню закриває себе. */
  onNavigate?: () => void;
}

/**
 * Одне посилання головного меню. Клієнтський компонент тому, що поточний шлях
 * читається лише на клієнті: usePathname навмисно недоступний у серверних
 * компонентах, щоб стан layout зберігався між переходами.
 * https://nextjs.org/docs/app/api-reference/functions/use-pathname
 */
export function NavLink({
  href,
  label,
  count,
  countLink,
  layout = "bar",
  onNavigate,
}: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href;
  const className =
    layout === "list"
      ? isActive
        ? "block py-3 text-base font-semibold"
        : "block py-3 text-base text-muted hover:text-foreground"
      : isActive
        ? "border-b-2 border-foreground py-2 text-sm font-medium whitespace-nowrap"
        : "border-b-2 border-transparent py-2 text-sm whitespace-nowrap text-muted hover:text-foreground";
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
          onClick={onNavigate}
        >
          {label}
        </Link>
        <Link
          href={countLink.href}
          aria-label={countLink.label}
          // Ширина не менша за 24px: одна цифра давала мішень 8px завширшки,
          // а WCAG 2.5.8 (AA) вимагає 24×24 CSS px.
          // https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum
          className={
            layout === "list"
              ? "inline-block min-w-6 py-3 text-base hover:underline"
              : "inline-block min-w-6 py-2 text-sm hover:underline"
          }
          onClick={onNavigate}
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
      onClick={onNavigate}
    >
      {label}
      {number === null ? null : <> {number}</>}
    </Link>
  );
}
