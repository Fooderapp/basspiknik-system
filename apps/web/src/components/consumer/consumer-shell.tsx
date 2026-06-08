"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ShoppingCart, Wine, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Dictionary } from "@/lib/i18n";
import { t } from "@/lib/i18n";

interface NavItem {
  href: string;
  icon: LucideIcon;
  key: keyof Dictionary;
  /** active when pathname starts with one of these */
  match: string[];
}

// Home (dashboard) · Buy · Bar · Profile. My Tickets is reached from Home.
const NAV: NavItem[] = [
  { href: "/home",    icon: Home,         key: "nav.home",    match: ["/home", "/my-tickets", "/tickets"] },
  { href: "/events",  icon: ShoppingCart, key: "nav.buy",     match: ["/events"] },
  { href: "/menu",    icon: Wine,         key: "nav.bar",     match: ["/menu"] },
  { href: "/profile", icon: User,         key: "nav.profile", match: ["/profile"] },
];

function isActive(pathname: string, item: NavItem) {
  return item.match.some((m) => pathname === m || pathname.startsWith(m + "/"));
}

export function ConsumerShell({
  dict,
  children,
}: {
  dict: Dictionary;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background">
      {/* ── Desktop sidebar (md+) ───────────────────────────────────────────── */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-60 flex-col border-r border-border bg-card">
        <Link href="/" className="flex h-16 items-center gap-2 px-6 font-bold text-lg tracking-tight">
          <Home className="h-5 w-5" />
          BassPiknik
        </Link>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-secondary text-gold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.25 : 1.75} />
                {t(dict, item.key)}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div className="md:pl-60">
        {/* extra bottom padding on mobile for the tab bar */}
        <main className="pb-24 md:pb-0">{children}</main>
      </div>

      {/* ── Mobile bottom tab bar (< md) — liquid glass, floating pill ──────── */}
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-50 pointer-events-none">
        <div
          className={cn(
            "pointer-events-auto mx-auto mb-[max(env(safe-area-inset-bottom),0.75rem)] w-[calc(100%-1.5rem)] max-w-md",
            "rounded-[26px] border border-white/10 bg-white/[0.06]",
            "backdrop-blur-2xl backdrop-saturate-150",
            "shadow-[0_8px_32px_rgba(0,0,0,0.55)]",
            "[box-shadow:inset_0_1px_0_0_rgba(255,255,255,0.12),0_8px_32px_rgba(0,0,0,0.55)]",
          )}
        >
          <div className="grid grid-cols-4 h-[60px]">
            {NAV.map((item) => {
              const active = isActive(pathname, item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                    active ? "text-gold" : "text-muted-foreground",
                  )}
                >
                  {/* active glass highlight */}
                  <span
                    className={cn(
                      "absolute inset-x-2 inset-y-1.5 rounded-2xl transition-opacity",
                      active ? "opacity-100 bg-gold/15 border border-gold/30" : "opacity-0",
                    )}
                  />
                  <Icon className="relative h-[21px] w-[21px]" strokeWidth={active ? 2.25 : 1.75} />
                  <span className="relative">{t(dict, item.key)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}
