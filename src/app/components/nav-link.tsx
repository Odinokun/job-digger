"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavLinkProps {
  href: string;
  label: string;
  /**
   * The number next to the name - in the `counter` colour, without a fill
   * (src/app/README.md#ink-theme). The link text is "Jobs 12": the space keeps
   * the name and the number separate words for a screen reader.
   */
  count?: number;
  /**
   * The number as a separate link - to where it is counted (Companies → Needs
   * attention, task 6.11). `label` is the full text for a screen reader: the
   * number alone says nothing without context.
   */
  countLink?: { href: string; label: string };
  /**
   * `bar` - in the header, with the active underline below; `list` - a row in the
   * burger menu on a narrow screen (`mobile-nav.tsx`), larger and with a bigger
   * touch target.
   */
  layout?: "bar" | "list";
  /** Following the link: the burger menu closes itself. */
  onNavigate?: () => void;
}

/**
 * One main menu link. A client component because the current path can only be
 * read on the client: usePathname is deliberately unavailable in server
 * components, so that layout state survives navigation.
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
    // Two links side by side, not one inside the other: HTML forbids nested `<a>`.
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
          // At least 24px wide: a single digit gave an 8px-wide target, and
          // WCAG 2.5.8 (AA) asks for 24×24 CSS px.
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
