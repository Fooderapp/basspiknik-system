import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, MapPin, Users, Ticket } from "lucide-react";
import { TicketSelector } from "@/components/events/ticket-selector";
import type { Event, TicketType } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

type EventWithTickets = Event & { ticket_types: TicketType[] };

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient() as any;

  const { data } = await supabase.from("events").select("*, ticket_types(*)").eq("slug", slug).eq("status", "PUBLISHED").single();
  const event = data as EventWithTickets | null;
  if (!event) notFound();

  const tts = event.ticket_types;
  const totalSold = tts.reduce((a, t) => a + t.sold, 0);
  const totalCapacity = tts.reduce((a, t) => a + t.quantity, 0);
  const isSoldOut = totalSold >= totalCapacity;

  return (
    <div className="min-h-screen bg-background">
      {/* Cover image */}
      {event.cover_image_url && (
        <>
          {/* ── Desktop: full-width blurred backdrop + centred 16:9 image (max 1200px) ── */}
          <div className="hidden sm:block w-full relative overflow-hidden bg-black">
            {/* Blurred fill — stretched behind */}
            <img
              src={event.cover_image_url}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50 pointer-events-none"
            />
            {/* Centred 16:9 image */}
            <div className="relative mx-auto max-w-[1200px] aspect-[16/9]">
              <img
                src={event.cover_image_url}
                alt={event.name}
                className="w-full h-full object-cover object-center"
              />
            </div>
          </div>

          {/* ── Mobile: 1:1 centre-crop ── */}
          <div className="sm:hidden w-full aspect-square overflow-hidden bg-muted">
            <img
              src={event.cover_image_url}
              alt={event.name}
              className="w-full h-full object-cover object-center"
            />
          </div>
        </>
      )}

      <div className="border-b bg-card">
        <div className="container max-w-4xl py-12">
          <div className="flex items-start gap-4 mb-4">
            <Badge variant={isSoldOut ? "destructive" : "success"}>{isSoldOut ? "Sold Out" : "On Sale"}</Badge>
          </div>
          <h1 className="text-4xl font-bold mb-3">{event.name}</h1>
          {event.description && <p className="text-muted-foreground text-lg mb-6">{event.description}</p>}
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{formatDate(event.start_date)}{event.end_date && ` — ${formatDate(event.end_date)}`}</span>
            {event.venue && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{event.venue}{event.address && `, ${event.address}`}</span>}
            <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />{totalSold}/{totalCapacity} tickets sold</span>
          </div>
        </div>
      </div>

      <div className="container max-w-4xl py-8">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2"><Ticket className="h-5 w-5" />Select Tickets</h2>
            {isSoldOut ? (
              <div className="rounded-lg border border-dashed p-8 text-center"><p className="text-muted-foreground">This event is sold out.</p></div>
            ) : (
              <TicketSelector
                eventId={event.id}
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
          </div>
          <div>
            <div className="rounded-lg border bg-card p-4 space-y-3 sticky top-4">
              <h3 className="font-semibold">{event.name}</h3>
              <div className="text-sm space-y-2 text-muted-foreground">
                <p className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{formatDate(event.start_date)}</p>
                {event.venue && <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{event.venue}</p>}
              </div>
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground mb-1">Tickets from</p>
                <p className="text-xl font-bold">{formatCurrency(Math.min(...tts.map((t) => t.price)))}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
