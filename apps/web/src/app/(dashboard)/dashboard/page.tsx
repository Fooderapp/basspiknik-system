import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { getDictionary, t } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, Ticket, Users, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Event } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

type EventWithTickets = Event & { ticket_types: Array<{ quantity: number; sold: number }> };

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  const role = profile?.role ?? "STAFF";
  const supabase = await createClient() as any;

  const [
    { count: eventCount },
    { data: revenueRows },
    { count: ticketCount },
    { count: guestCount },
    { data: eventsRaw },
    settings,
  ] = await Promise.all([
    supabase.from("events").select("*", { count: "exact", head: true }).in("status", ["PUBLISHED", "DRAFT"]),
    supabase.from("orders").select("total").eq("status", "PAID"),
    supabase.from("tickets").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }).in("role", ["GUEST", "VIP_GUEST"]),
    supabase.from("events").select("*, ticket_types(quantity, sold)").gte("start_date", new Date().toISOString()).order("start_date").limit(5),
    getSettings(),
  ]);

  const dict = getDictionary(settings.language);
  const fmt = (n: number) => formatCurrency(n, settings.currency);

  const totalRevenue = (revenueRows as Array<{ total: number }> | null)?.reduce((s, o) => s + o.total, 0) ?? 0;
  const events = (eventsRaw as EventWithTickets[] | null) ?? [];

  const statCards = [
    { title: t(dict, "dash.total_events"),  value: String(eventCount ?? 0),  icon: CalendarDays, bg: "var(--pastel-green)",    fg: "var(--pastel-green-ink)" },
    { title: t(dict, "dash.revenue"),       value: fmt(totalRevenue),         icon: TrendingUp,   bg: "var(--pastel-gold)",     fg: "var(--pastel-gold-ink)" },
    { title: t(dict, "dash.tickets_sold"),  value: String(ticketCount ?? 0),  icon: Ticket,       bg: "var(--pastel-sky)",      fg: "var(--pastel-sky-ink)" },
    { title: t(dict, "dash.guests"),        value: String(guestCount ?? 0),   icon: Users,        bg: "var(--pastel-lavender)", fg: "var(--pastel-lavender-ink)" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight" style={{ letterSpacing: "-0.03em" }}>{t(dict, "dash.title")}</h1>
          <p className="text-muted-foreground mt-1">{t(dict, "dash.welcome")}, {profile?.name ?? "—"}</p>
        </div>
        {["ADMIN", "EDITOR"].includes(role) && (
          <Button className="rounded-full px-6" asChild><Link href="/dashboard/events/new">{t(dict, "dash.new_event")}</Link></Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="rounded-3xl shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: stat.bg, color: stat.fg }}>
                  <Icon className="h-[18px] w-[18px]" />
                </span>
              </CardHeader>
              <CardContent><div className="text-3xl font-extrabold tracking-tight">{stat.value}</div></CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader><CardTitle>{t(dict, "dash.upcoming_events")}</CardTitle></CardHeader>
        <CardContent>
          {!events.length ? (
            <p className="text-muted-foreground text-sm">
              {t(dict, "dash.no_upcoming")}{" "}
              {["ADMIN", "EDITOR"].includes(role) && (
                <Link href="/dashboard/events/new" className="text-primary underline">{t(dict, "dash.create_one")}</Link>
              )}
            </p>
          ) : (
            <div className="space-y-3">
              {events.map((event) => {
                const totalCapacity = event.ticket_types.reduce((a, tt) => a + tt.quantity, 0);
                const totalSold = event.ticket_types.reduce((a, tt) => a + tt.sold, 0);
                const pct = totalCapacity > 0 ? Math.round((totalSold / totalCapacity) * 100) : 0;
                return (
                  <Link key={event.id} href={`/dashboard/events/${event.id}`}
                    className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent transition-colors">
                    <div>
                      <p className="font-medium">{event.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(event.start_date).toLocaleDateString()} · {event.venue}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{totalSold}/{totalCapacity} {t(dict, "dash.sold")}</p>
                      <p className="text-xs text-muted-foreground">{pct}% {t(dict, "dash.capacity")}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
