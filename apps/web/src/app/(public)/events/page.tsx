import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { getSettings } from "@/lib/settings";
import { getDictionary, t } from "@/lib/i18n";
import type { Event, TicketType } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const metadata = { title: "Buy Tickets" };

type EventWithTickets = Event & { ticket_types: TicketType[] };

const bigDateFmt = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });

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
            const totalSold = types.reduce((s, t) => s + t.sold, 0);
            const totalQty = types.reduce((s, t) => s + t.quantity, 0);
            const soldOut = totalQty > 0 && totalSold >= totalQty;
            const priceList = types.filter((tt) => !tt.is_door_ticket);

            const startDate = new Date(event.start_date);

            const card = (
              <div
                className={`flex h-full flex-col gap-4 overflow-hidden rounded-[2.25rem] p-4 transition-transform shadow-sm ${
                  soldOut ? "opacity-60" : "hover:-translate-y-0.5"
                }`}
                style={{ background: "#E5E5E5" }}
              >
                {event.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={event.cover_image_url}
                    alt={event.name}
                    className="h-[190px] w-full rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-[190px] w-full items-center justify-center rounded-xl bg-card">
                    <ShoppingBag className="h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />
                  </div>
                )}

                {/* Grows to push the CTA to the same baseline on every card */}
                <div className="flex flex-1 flex-col gap-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-3xl font-extrabold uppercase leading-tight tracking-tight" style={{ letterSpacing: "-0.03em" }}>
                      {bigDateFmt.format(startDate)}
                    </h2>
                    {soldOut && <Badge variant="destructive" className="shrink-0">{t(dict, "events.sold_out")}</Badge>}
                  </div>

                  {/* Itemized ticket prices */}
                  {priceList.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {priceList.map((tt) => {
                        const price = tt.sale_enabled && tt.sale_price != null ? tt.sale_price : tt.price;
                        return (
                          <div key={tt.id} className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="uppercase tracking-wide text-xs font-medium text-muted-foreground line-clamp-1">
                              {tt.name}
                            </span>
                            <span className="font-semibold tabular-nums shrink-0">
                              {price === 0 ? t(dict, "ticket.free") : formatCurrency(price, settings.currency)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* CTA */}
                {!soldOut && (
                  <span className="block w-full rounded-full bg-[#16170F] py-3 text-center text-sm font-bold text-white">
                    {t(dict, "events.buy")}
                  </span>
                )}
              </div>
            );

            return soldOut ? (
              <div key={event.id} className="h-full">{card}</div>
            ) : (
              <Link key={event.id} href={`/events/${event.slug}`} className="block h-full">
                {card}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
