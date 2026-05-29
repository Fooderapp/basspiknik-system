import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, MapPin, Users, Ticket } from "lucide-react";
import { TicketSelector } from "@/components/events/ticket-selector";
import type { Event, TicketType } from "@/lib/supabase/types";
import { getSettings } from "@/lib/settings";
import { getDictionary, t } from "@/lib/i18n";

/* eslint-disable @typescript-eslint/no-explicit-any */

type EventWithTickets = Event & { ticket_types: TicketType[] };

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient() as any;

  const [{ data }, settings] = await Promise.all([
    supabase.from("events").select("*, ticket_types(*)").eq("slug", slug).eq("status", "PUBLISHED").single(),
    getSettings(),
  ]);

  const event = data as EventWithTickets | null;
  if (!event) notFound();

  const dict = getDictionary(settings.language);
  const tts = event.ticket_types;
  const totalSold = tts.reduce((a, tt) => a + tt.sold, 0);
  const totalCapacity = tts.reduce((a, tt) => a + tt.quantity, 0);
  const isSoldOut = totalSold >= totalCapacity;

  return (
    <div className="min-h-screen bg-background">
      {/* Cover image */}
      {event.cover_image_url && (
        <>
          {/* ── Desktop + Mobile: blurred backdrop + true 16:9 centred image ── */}
          <div className="w-full relative overflow-hidden bg-black">
            {/* Blurred fill behind */}
            <img
              src={event.cover_image_url}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50 pointer-events-none"
            />
            {/* 16:9 container — width drives height, max 1200px wide */}
            <div className="relative mx-auto w-full max-w-[1200px] aspect-video">
              <img
                src={event.cover_image_url}
                alt={event.name}
                className="w-full h-full object-cover object-center"
              />
            </div>
          </div>
        </>
      )}

      <div className="border-b bg-card">
        <div className="container max-w-4xl py-12">
          <div className="flex items-start gap-4 mb-4">
            <Badge variant={isSoldOut ? "destructive" : "success"}>
              {isSoldOut ? t(dict, "event.sold_out") : t(dict, "event.on_sale")}
            </Badge>
          </div>
          <h1 className="text-4xl font-bold mb-3">{event.name}</h1>
          {event.description && <p className="text-muted-foreground text-lg mb-6">{event.description}</p>}
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" />
              {formatDate(event.start_date)}{event.end_date && ` — ${formatDate(event.end_date)}`}
            </span>
            {event.venue && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />{event.venue}{event.address && `, ${event.address}`}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4" />{totalSold}/{totalCapacity} {t(dict, "event.tickets_sold")}
            </span>
          </div>
        </div>
      </div>

      <div className="container max-w-4xl py-8">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Ticket className="h-5 w-5" />{t(dict, "event.select_tickets")}
            </h2>
            {isSoldOut ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <p className="text-muted-foreground">{t(dict, "event.sold_out_msg")}</p>
              </div>
            ) : (
              <TicketSelector
                eventId={event.id}
                dict={dict}
                currency={settings.currency}
                ticketTypes={tts.map((tt) => ({
                  id: tt.id, name: tt.name,
                  description: tt.description ?? undefined,
                  price: tt.price,
                  saleEnabled: tt.sale_enabled ?? false,
                  salePrice: tt.sale_price ?? undefined,
                  available: tt.quantity - tt.sold,
                  maxPerOrder: tt.max_per_order,
                  tier: tt.tier,
                  isBundle: tt.is_bundle,
                  bundleSize: tt.bundle_size ?? undefined,
                  entriesPerTicket: tt.entries_per_ticket ?? 1,
                }))}
              />
            )}
          </div>
          <div>
            <div className="rounded-lg border bg-card p-4 space-y-3 sticky top-4">
              <h3 className="font-semibold">{event.name}</h3>
              <div className="text-sm space-y-2 text-muted-foreground">
                <p className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{formatDate(event.start_date)}</p>
                {event.venue && <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{event.venue}</p>}
              </div>
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground mb-1">
                  {settings.language === "hu" ? "Jegy ártól" : "Tickets from"}
                </p>
                <p className="text-xl font-bold">
                  {formatCurrency(Math.min(...tts.map((tt) => tt.price)), settings.currency)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
