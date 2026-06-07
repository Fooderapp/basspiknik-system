import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { CalendarDays, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import { getSettings } from "@/lib/settings";
import { getDictionary, t } from "@/lib/i18n";
import type { Event, TicketType } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const metadata = { title: "Events" };

type EventWithTickets = Event & { ticket_types: TicketType[] };

export default async function EventsPage() {
  const supabase = await createClient() as any;
  const [{ data }, settings] = await Promise.all([
    supabase
      .from("events")
      .select("*, ticket_types(*)")
      .eq("status", "PUBLISHED")
      .order("start_date", { ascending: true }),
    getSettings(),
  ]);

  const dict = getDictionary(settings.language);
  const events = (data ?? []) as EventWithTickets[];

  return (
    <div className="container max-w-5xl px-4 py-8 md:py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{t(dict, "events.title")}</h1>
        <p className="text-muted-foreground mt-1">{t(dict, "events.subtitle")}</p>
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <CalendarDays className="h-10 w-10 mx-auto mb-4 text-muted-foreground/40" />
          <p className="font-medium text-muted-foreground">{t(dict, "events.none")}</p>
          <p className="text-sm text-muted-foreground mt-1">{t(dict, "events.none_sub")}</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => {
            const tts = event.ticket_types.filter((tt) => !tt.is_door_ticket);
            const sold = tts.reduce((a, tt) => a + tt.sold, 0);
            const cap = tts.reduce((a, tt) => a + tt.quantity, 0);
            const isSoldOut = cap > 0 && sold >= cap;
            const lowest = tts.length ? Math.min(...tts.map((tt) => tt.price)) : null;

            return (
              <Link
                key={event.id}
                href={`/events/${event.slug}`}
                className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-foreground/30"
              >
                <div className="relative aspect-video bg-muted overflow-hidden">
                  {event.cover_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={event.cover_image_url}
                      alt={event.name}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <CalendarDays className="h-10 w-10 text-muted-foreground/30" />
                    </div>
                  )}
                  <div className="absolute top-3 left-3">
                    <Badge variant={isSoldOut ? "destructive" : "success"}>
                      {isSoldOut ? t(dict, "events.sold_out") : t(dict, "event.on_sale")}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-1 flex-col p-4">
                  <h3 className="font-semibold tracking-tight line-clamp-1">{event.name}</h3>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatDate(event.start_date)}
                    </span>
                    {event.venue && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        <span className="line-clamp-1">{event.venue}</span>
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex items-end justify-between pt-3 border-t border-border">
                    <div>
                      <p className="text-[11px] text-muted-foreground">{t(dict, "events.from")}</p>
                      <p className="font-bold">
                        {lowest != null ? formatCurrency(lowest, settings.currency) : "—"}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-foreground group-hover:underline">
                      {isSoldOut ? t(dict, "events.sold_out") : t(dict, "events.buy")}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
