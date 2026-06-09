import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays, MapPin, Ticket, Plus } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { Event, EventStatus } from "@/lib/supabase/types";

type EventWithTickets = Event & { ticket_types: Array<{ quantity: number; sold: number }> };

const STATUS_COLORS: Record<EventStatus, "secondary" | "success" | "destructive" | "outline"> = {
  DRAFT: "secondary",
  PUBLISHED: "success",
  CANCELLED: "destructive",
  ARCHIVED: "outline",
};

// Bottom status bar colour per state.
const STATUS_BAR: Record<EventStatus, string> = {
  DRAFT: "#6b7280",
  PUBLISHED: "#9FE870",
  CANCELLED: "#ef4444",
  ARCHIVED: "#3f3f46",
};

export default async function EventsPage() {
  const profile = await getCurrentProfile();
  if (!["ADMIN", "EDITOR"].includes(profile?.role ?? "")) redirect("/dashboard");

  const supabase = await createClient();
  const { data } = await supabase.from("events").select("*, ticket_types(quantity, sold)").order("start_date", { ascending: false });
  const events = (data as EventWithTickets[] | null) ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Events</h1>
          <p className="text-muted-foreground">{events.length} total events</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/events/new"><Plus className="mr-2 h-4 w-4" />New Event</Link>
        </Button>
      </div>

      {!events.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <CalendarDays className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No events yet</h3>
            <p className="text-muted-foreground mb-4">Create your first event to start selling tickets.</p>
            <Button asChild><Link href="/dashboard/events/new">Create Event</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {events.map((event) => {
            const totalSold = event.ticket_types.reduce((a, t) => a + t.sold, 0);
            const totalCapacity = event.ticket_types.reduce((a, t) => a + t.quantity, 0);
            const pct = totalCapacity > 0 ? Math.round((totalSold / totalCapacity) * 100) : 0;
            return (
              <Link key={event.id} href={`/dashboard/events/${event.id}`}>
                <Card className="relative overflow-hidden hover:border-primary transition-colors cursor-pointer">
                  <CardContent className="p-4 pb-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold truncate">{event.name}</h3>
                          <Badge variant={STATUS_COLORS[event.status]}>{event.status}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{formatDate(event.start_date)}</span>
                          {event.venue && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{event.venue}</span>}
                          <span className="flex items-center gap-1"><Ticket className="h-3 w-3" />{totalSold}/{totalCapacity} ({pct}%)</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                  {/* status bar — bottom, coloured by state */}
                  <span
                    className="absolute bottom-0 left-0 right-0 h-1"
                    style={{ backgroundColor: STATUS_BAR[event.status] }}
                  />
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
