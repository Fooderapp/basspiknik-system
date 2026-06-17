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
  loggedIn = false,
}: {
  dict: Dictionary;
  children: React.ReactNode;
  loggedIn?: boolean;
}) {
  const pathname = usePathname();
  // Logged-out users have no in-app home — send them to the public landing.
  const homeHref = (href: string) => (href === "/home" && !loggedIn ? "/" : href);

  return (
    <div className="min-h-screen bg-background">
      {/* ── Main content ────────────────────────────────────────────────────── */}
      {/* extra bottom padding everywhere for the floating dock */}
      <main className="pb-28">
        {children}
        <footer className="mt-10 pb-4 flex flex-wrap justify-center gap-x-5 gap-y-1 px-4">
          <Link href="/adatvedelem" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            {t(dict, "footer.privacy")}
          </Link>
          <Link href="/aszf" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            {t(dict, "footer.aszf")}
          </Link>
          <Link href="/impresszum" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            {t(dict, "footer.impresszum")}
          </Link>
        </footer>
      </main>

      {/* ── Bottom dock — pill, black-based, same on every breakpoint ───────── */}
      <nav className="fixed inset-x-0 bottom-0 z-50 pointer-events-none">
        <div
          className={cn(
            "pointer-events-auto mx-auto mb-[max(env(safe-area-inset-bottom),0.75rem)] w-[calc(100%-1.5rem)] max-w-md",
            "rounded-full",
            "shadow-[0_8px_28px_rgba(20,22,15,0.25)]",
          )}
          style={{ background: "#16170F" }}
        >
          <div className="grid grid-cols-4 h-[60px]">
            {NAV.map((item) => {
              const active = isActive(pathname, item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={homeHref(item.href)}
                  className={cn(
                    "group relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors",
                  )}
                  style={{ color: active ? "#163300" : "rgba(255,255,255,0.5)" }}
                >
                  {/* active highlight */}
                  <span
                    className="absolute inset-x-2 inset-y-1.5 rounded-full transition-opacity"
                    style={{ background: "var(--pastel-green)", opacity: active ? 1 : 0 }}
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
