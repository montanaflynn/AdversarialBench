"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Overview" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/runs", label: "Runs" },
  { href: "/leaks", label: "Leaks" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-border sticky top-0 z-50 bg-surface/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-6 flex items-center h-14 gap-8">
        <Link href="/" className="text-text-primary font-semibold tracking-tight text-sm">
          AdversarialBench
        </Link>
        <div className="flex gap-1">
          {links.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  active
                    ? "bg-surface-overlay text-text-primary"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
