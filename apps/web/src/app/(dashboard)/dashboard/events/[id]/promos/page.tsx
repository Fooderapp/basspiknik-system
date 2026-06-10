import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PromoManager } from "@/components/events/promo-manager";
import type { Event, PromoCode } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default async function PromosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient() as any;

  const [{ data: eventData }, { data: promoData }] = await Promise.all([
    supabase.from("events").select("id,name,slug").eq("id", id).single(),
    supabase.from("promo_codes").select("*").eq("event_id", id).order("created_at", { ascending: false }),
  ]);

  if (!eventData) notFound();

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard/events" className="hover:text-foreground">Events</Link>
        <span>/</span>
        <Link href={`/dashboard/events/${id}`} className="hover:text-foreground">{(eventData as Event).name}</Link>
        <span>/</span>
        <span className="text-foreground font-medium">Promo Codes</span>
      </div>
      <PromoManager
        eventId={id}
        eventName={(eventData as Event).name}
        eventSlug={(eventData as Event).slug}
        initialPromos={(promoData ?? []) as PromoCode[]}
      />
    </div>
  );
}
