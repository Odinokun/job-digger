import Link from "next/link";

import { NavLink } from "./nav-link";

// Порядок розділів фіксований і повторює docs/ui.md, розділ 4.
// Jobs живе в корені: він відкривається за замовчуванням.
const sections = [
  { href: "/", label: "Jobs" },
  { href: "/companies", label: "Companies" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
];

export function AppHeader() {
  return (
    <header className="border-b border-gray-200">
      <div className="mx-auto flex max-w-5xl items-center gap-8 px-6">
        <Link href="/" className="py-3 font-sans text-lg font-bold">
          Job Digger
        </Link>
        <nav aria-label="Main" className="flex items-center gap-6">
          {sections.map((section) => (
            <NavLink key={section.href} {...section} />
          ))}
        </nav>
      </div>
    </header>
  );
}
