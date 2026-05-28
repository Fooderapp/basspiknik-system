import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, Ticket, Users, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Event } from "@/lib/supabase/types";

type EventWithTickets = Event & { ticket_types: Array<{ quantity: number; sold: number }> };

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  const role = profile?.role ?? "STAFF";
  const supabase = await createClient();

  const [
    { count: eventCount },
    { data: revenueRows },
    { count: ticketCount },
    { count: guestCount },
    { data: eventsRaw },
  ] = await Promise.all([
    supabase.from("events").select("*", { count: "exact", head: true }).in("status", ["PUBLISHED", "DRAFT"]),
    supabase.from("orders").select("total").eq("status", "PAID"),
    supabase.from("tickets").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }).in("role", ["GUEST", "VIP_GUEST"]),
    supabase.from("events").select("*, ticket_types(quantity, sold)").gte("start_date", new Date().toISOString()).order("start_date").limit(5),
  ]);

  const totalRevenue = (revenueRows as Array<{ total: number }> | null)?.reduce((s, o) => s + o.total, 0) ?? 0;
  const events = (eventsRaw as EventWithTickets[] | null) ?? [];

  const statCards = [
    { title: "Total Events", value: eventCount ?? 0, icon: CalendarDays, color: "text-blue-500" },
    { title: "Revenue", value: formatCurrency(totalRevenue), icon: TrendingUp, color: "text-green-500" },
    { title: "Tickets Sold", value: ticketCount ?? 0, icon: Ticket, color: "text-purple-500" },
    { title: "Guests", value: guestCount ?? 0, icon: Users, color: "text-orange-500" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {profile?.name ?? "—"}</p>
        </div>
        {["ADMIN", "EDITOR"].includes(role) && (
          <Button asChild><Link href="/dashboard/events/new">+ New Event</Link></Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{stat.value}</div></CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader><CardTitle>Upcoming Events</CardTitle></CardHeader>
        <CardContent>
          {!events.length ? (
            <p className="text-muted-foreground text-sm">
              No upcoming events.{" "}
              {["ADMIN", "EDITOR"].includes(role) && <Link href="/dashboard/events/new" className="text-primary underline">Create one →</Link>}
            </p>
          ) : (
            <div className="space-y-3">
              {events.map((event) => {
                const totalCapacity = event.ticket_types.reduce((a, t) => a + t.quantity, 0);
                const totalSold = event.ticket_types.reduce((a, t) => a + t.sold, 0);
                const pct = totalCapacity > 0 ? Math.round((totalSold / totalCapacity) * 100) : 0;
                return (
                  <Link key={event.id} href={`/dashboard/events/${event.id}`} className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent transition-colors">
                    <div>
                      <p className="font-medium">{event.name}</p>
                      <p className="text-sm text-muted-foreground">{new Date(event.start_date).toLocaleDateString()} · {event.venue}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{totalSold}/{totalCapacity} sold</p>
                      <p className="text-xs text-muted-foreground">{pct}% capacity</p>
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
