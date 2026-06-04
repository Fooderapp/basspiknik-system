import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { formatDate, formatCurrency } from "@/lib/utils";
import { TicketSelector } from "@/components/events/ticket-selector";
import { CalendarDays, MapPin } from "lucide-react";
import type { Event, TicketType } from "@/lib/supabase/types";
import { getSettings } from "@/lib/settings";
import { getDictionary } from "@/lib/i18n";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default async function WidgetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient() as any;

  const [{ data }, settings] = await Promise.all([
    supabase.from("events").select("*, ticket_types(*)").eq("slug", slug).eq("status", "PUBLISHED").single(),
    getSettings(),
  ]);

  if (!data) notFound();

  const event = data as Event & { ticket_types: TicketType[] };
  const dict = getDictionary(settings.language);
  const tts = event.ticket_types ?? [];
  const totalSold = tts.reduce((a, t) => a + t.sold, 0);
  const totalCapacity = tts.reduce((a, t) => a + t.quantity, 0);
  const isSoldOut = totalSold >= totalCapacity;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{event.name}</title>
        {/* Allow embedding in iframes */}
        <style>{`
          * { box-sizing: border-box; }
          body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: white; }
        `}</style>
      </head>
      <body>
        <div className="p-4 space-y-4">
          {/* Mini event header */}
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold leading-tight">{event.name}</h2>
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" /> {formatDate(event.start_date)}
              </span>
              {event.venue && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> {event.venue}
                </span>
              )}
            </div>
            {tts.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Tickets from {formatCurrency(Math.min(...tts.map((t) => t.sale_enabled && t.sale_price != null ? t.sale_price : t.price)))}
              </p>
            )}
          </div>

          {isSoldOut ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
              This event is sold out.
            </div>
          ) : (
            <TicketSelector
              eventId={event.id}
              dict={dict}
              currency={settings.currency}
              isLoggedIn={false}
              ticketTypes={tts.map((t) => ({
                id: t.id, name: t.name,
                description: t.description ?? undefined,
                price: t.price,
                saleEnabled: t.sale_enabled ?? false,
                salePrice: t.sale_price ?? undefined,
                available: t.quantity - t.sold,
                maxPerOrder: t.max_per_order,
                tier: t.tier,
                isBundle: t.is_bundle,
                bundleSize: t.bundle_size ?? undefined,
                entriesPerTicket: t.entries_per_ticket ?? 1,
              }))}
            />
          )}

          <p className="text-[10px] text-muted-foreground text-center pt-2">
            Powered by <a href={process.env.NEXT_PUBLIC_APP_URL} target="_blank" rel="noopener noreferrer" className="underline">EventOS</a>
          </p>
        </div>
      </body>
    </html>
  );
}
