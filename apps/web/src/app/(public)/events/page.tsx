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
      <div className="mb-7">
        <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight leading-[1.05]" style={{ letterSpacing: "-0.03em" }}>{t(dict, "events.title")}</h1>
        <p className="text-muted-foreground text-base mt-2">{t(dict, "events.subtitle")}</p>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "var(--pastel-green)", color: "var(--pastel-green-ink)" }}>
            <ShoppingBag className="h-7 w-7" strokeWidth={1.75} />
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
                className={`overflow-hidden rounded-3xl bg-card transition-transform shadow-sm ${
                  soldOut ? "opacity-60" : "hover:-translate-y-0.5"
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

                {/* Info panel */}
                <div className="m-2 flex flex-col gap-3 rounded-[1.5rem] p-4" style={{ background: "var(--muted)" }}>
                  {/* Date heading */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xl font-extrabold tracking-tight leading-tight" style={{ letterSpacing: "-0.02em" }}>
                      <CalendarDays className="h-4 w-4 shrink-0" strokeWidth={2} />
                      <span>
                        {formatDate(event.start_date)}
                        {event.end_date ? ` — ${formatDate(event.end_date)}` : ""}
                      </span>
                    </div>
                    {soldOut && <Badge variant="destructive">{t(dict, "events.sold_out")}</Badge>}
                  </div>

                  <h3 className="text-base font-bold tracking-tight line-clamp-2">{event.name}</h3>

                  {/* Venue pill */}
                  {event.venue && (
                    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium">
                      <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                      <span className="line-clamp-1">
                        {event.venue}
                        {event.address ? `, ${event.address}` : ""}
                      </span>
                    </span>
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

                  {/* CTA */}
                  {!soldOut && (
                    <span className="block w-full rounded-full bg-[#16170F] py-3 text-center text-sm font-bold text-white">
                      {t(dict, "events.buy")}
                    </span>
                  )}
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
