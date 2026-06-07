import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { CalendarDays, MapPin, Tag, ShoppingBag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatDate, formatCurrency } from "@/lib/utils";
import { getSettings } from "@/lib/settings";
import { getDictionary, t } from "@/lib/i18n";
import type { Event, TicketType } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const metadata = { title: "Buy Tickets" };

type EventWithTickets = Event & { ticket_types: TicketType[] };

function lowestPrice(types: TicketType[]): number | null {
  const available = types.filter((t) => t.quantity - t.sold > 0);
  if (available.length === 0) return null;
  return Math.min(
    ...available.map((t) => (t.sale_enabled && t.sale_price != null ? t.sale_price : t.price)),
  );
}

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
    <div className="mx-auto w-full max-w-5xl px-5 py-6 md:py-10">
      {/* Header — matches mobile Screen title/subtitle */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t(dict, "events.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t(dict, "events.subtitle")}</p>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted">
            <ShoppingBag className="h-6 w-6 text-muted-foreground" strokeWidth={1.75} />
          </div>
          <p className="text-lg font-semibold tracking-tight">{t(dict, "events.none")}</p>
          <p className="text-sm text-muted-foreground mt-1">{t(dict, "events.none_sub")}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => {
            const types = event.ticket_types ?? [];
            const minPrice = lowestPrice(types);
            const totalSold = types.reduce((s, t) => s + t.sold, 0);
            const totalQty = types.reduce((s, t) => s + t.quantity, 0);
            const soldOut = totalQty > 0 && totalSold >= totalQty;
            const ticketCount = types.length;

            const card = (
              <div
                className={`overflow-hidden rounded-xl border border-border bg-card transition-colors ${
                  soldOut ? "opacity-60" : "hover:border-foreground/30"
                }`}
              >
                {/* Cover */}
                {event.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={event.cover_image_url}
                    alt={event.name}
                    className="h-40 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-24 w-full items-center justify-center bg-muted">
                    <ShoppingBag className="h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />
                  </div>
                )}

                <div className="flex flex-col gap-3 p-4">
                  {/* Name + sold-out badge */}
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="flex-1 text-lg font-bold tracking-tight line-clamp-2">{event.name}</h3>
                    {soldOut && <Badge variant="destructive">{t(dict, "events.sold_out")}</Badge>}
                  </div>

                  {/* Date */}
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span>
                      {formatDate(event.start_date)}
                      {event.end_date ? ` — ${formatDate(event.end_date)}` : ""}
                    </span>
                  </div>

                  {/* Venue */}
                  {event.venue && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" strokeWidth={1.75} />
                      <span className="line-clamp-1">
                        {event.venue}
                        {event.address ? `, ${event.address}` : ""}
                      </span>
                    </div>
                  )}

                  <Separator />

                  {/* Ticket types + lowest price */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Tag className="h-3.5 w-3.5" strokeWidth={1.75} />
                      <span>
                        {ticketCount}{" "}
                        {ticketCount === 1 ? t(dict, "events.ticket_type") : t(dict, "events.ticket_types")}
                      </span>
                    </div>
                    {minPrice != null && (
                      <span className="text-sm font-semibold">
                        {t(dict, "events.from")} {formatCurrency(minPrice, settings.currency)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );

            return soldOut ? (
              <div key={event.id}>{card}</div>
            ) : (
              <Link key={event.id} href={`/events/${event.slug}`} className="block">
                {card}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
