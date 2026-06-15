import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { ChevronLeft, CalendarDays, MapPin } from "lucide-react";
import { TicketSelector } from "@/components/events/ticket-selector";
import { EventCover } from "@/components/public/event-cover";
import type { Event, TicketType } from "@/lib/supabase/types";
import { getSettings } from "@/lib/settings";
import { getDictionary, t } from "@/lib/i18n";

/* eslint-disable @typescript-eslint/no-explicit-any */

type EventWithTickets = Event & { ticket_types: TicketType[] };

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient() as any;

  const [{ data }, settings, { data: { user } }] = await Promise.all([
    supabase.from("events").select("*, ticket_types(*)").eq("slug", slug).eq("status", "PUBLISHED").single(),
    getSettings(),
    supabase.auth.getUser(),
  ]);

  const event = data as EventWithTickets | null;
  if (!event) notFound();

  const dict = getDictionary(settings.language);
  // Public purchase flow: hide door tickets (POS-only), hidden types, and any
  // outside their scheduled visibility window.
  const nowMs = Date.now();
  type VisTT = TicketType & { is_visible?: boolean; visible_from?: string | null; visible_until?: string | null };
  // Hide only door (POS-only), manually-hidden, and expired types. A type whose
  // sale hasn't started yet (visible_from in the future) is SHOWN but locked as
  // "Coming Soon" — not purchasable.
  const tts = (event.ticket_types as VisTT[]).filter((t) => {
    if (t.is_door_ticket) return false;
    if (t.is_visible === false) return false;
    if (t.visible_until && new Date(t.visible_until).getTime() < nowMs) return false;
    return true;
  });
  const comingSoon = (t: VisTT) => !!(t.visible_from && new Date(t.visible_from).getTime() > nowMs);

  return (
    <div>
      <EventCover src={event.cover_image_url} />

      <div className="mx-auto w-full max-w-2xl px-5 py-4">
      {/* Header — back + event name (mobile parity) */}
      <div className="mb-5 flex items-center gap-3">
        <Link href="/events" className="flex items-center gap-0.5 text-base hover:opacity-60">
          <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={1.75} />
          {t(dict, "ticketdetail.back")}
        </Link>
        <h1 className="flex-1 truncate text-lg font-bold tracking-tight">{event.name}</h1>
      </div>

      {/* Event meta */}
      <div className="mb-5 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.75} />
          {formatDate(event.start_date)}
        </div>
        {event.venue && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" strokeWidth={1.75} />
            {event.venue}
            {event.address ? `, ${event.address}` : ""}
          </div>
        )}
        {event.description && (
          <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
        )}
      </div>

      <TicketSelector
        eventId={event.id}
        dict={dict}
        currency={settings.currency}
        isLoggedIn={!!user}
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
          comingSoon: comingSoon(tt),
        }))}
      />
      </div>
    </div>
  );
}
