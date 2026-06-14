"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, CalendarDays, Users, BarChart3,
  Ticket, Wine, ScanLine, UserCheck, Gift,
  LogOut, ChevronLeft, Menu, User, Settings, QrCode, Music, Home, Image as ImageIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: string[];
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["ADMIN", "EDITOR", "STAFF", "SELLER", "BARTENDER"] },
  { label: "Events", href: "/dashboard/events", icon: CalendarDays, roles: ["ADMIN", "EDITOR"] },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3, roles: ["ADMIN"] },
  { label: "Guests", href: "/dashboard/guests", icon: Users, roles: ["ADMIN", "EDITOR"] },
  { label: "Drinks", href: "/dashboard/drinks", icon: Wine, roles: ["ADMIN", "EDITOR", "STAFF", "BARTENDER"] },
  { label: "Seller", href: "/seller", icon: Ticket, roles: ["ADMIN", "EDITOR", "SELLER"] },
  { label: "Check-In", href: "/checkin", icon: UserCheck, roles: ["ADMIN", "EDITOR", "STAFF"] },
  { label: "Bar",      href: "/bar",                icon: ScanLine,  roles: ["ADMIN", "EDITOR", "STAFF", "BARTENDER"] },
  { label: "Tasks",    href: "/dashboard/tasks",    icon: Gift,      roles: ["ADMIN"] },
  { label: "QR Codes", href: "/dashboard/qr",       icon: QrCode,    roles: ["ADMIN", "EDITOR"] },
  { label: "Homepage", href: "/dashboard/site",     icon: Home,      roles: ["ADMIN", "EDITOR"] },
  { label: "Artists",  href: "/dashboard/artists",  icon: Music,     roles: ["ADMIN", "EDITOR"] },
  { label: "Gallery",  href: "/dashboard/gallery",  icon: ImageIcon, roles: ["ADMIN", "EDITOR"] },
  { label: "Settings", href: "/dashboard/settings", icon: Settings,  roles: ["ADMIN"] },
];

interface SidebarProps {
  userRole: string;
}

export function Sidebar({ userRole }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(userRole));

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("Signed out");
    router.push("/");
    router.refresh();
  };

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r bg-card transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className="flex h-16 items-center justify-between px-4">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <Ticket className="h-6 w-6 text-primary" />
            <span className="font-bold text-lg">Bass Piknik</span>
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto"
        >
          {collapsed ? <Menu className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <Separator />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                collapsed && "justify-center px-2"
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <Separator />

      {/* Footer */}
      <div className={cn("flex items-center gap-2 p-3", collapsed && "justify-center flex-col")}>
        {!collapsed && (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <User className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-xs text-muted-foreground truncate">{userRole}</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSignOut}
          title="Sign out"
          className="shrink-0"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </aside>
  );
}
