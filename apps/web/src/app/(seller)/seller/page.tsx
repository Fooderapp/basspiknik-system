import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { SellerApp } from "@/components/seller/seller-app";
import type { Event, TicketType } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

type EventWithTickets = Event & { ticket_types: TicketType[] };

export default async function SellerPage() {
  const profile = await getCurrentProfile();
  const supabase = await createClient() as any;

  const { data } = await supabase
    .from("events")
    .select("*, ticket_types(*)")
    .in("status", ["PUBLISHED", "DRAFT"])
    .order("start_date", { ascending: true });

  const events = (data ?? []) as EventWithTickets[];

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-lg">Seller Terminal</h1>
          <p className="text-xs text-muted-foreground">{profile?.name ?? profile?.email}</p>
        </div>
        <a href="/dashboard" className="text-xs text-muted-foreground underline">Dashboard</a>
      </div>
      <SellerApp events={events} sellerId={profile!.id} />
    </div>
  );
}
