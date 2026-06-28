import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { SellerApp } from "@/components/seller/seller-app";
import { getSettings } from "@/lib/settings";
import { getDictionary } from "@/lib/i18n";
import type { Event, TicketType } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

type EventWithTickets = Event & { ticket_types: TicketType[] };

export default async function SellerPage({ searchParams }: { searchParams: Promise<{ door?: string }> }) {
  const { door } = await searchParams;
  const doorMode = door === "1";
  const [profile, settings] = await Promise.all([getCurrentProfile(), getSettings()]);
  const supabase = await createClient() as any;

  const { data } = await supabase
    .from("events")
    .select("*, ticket_types(*)")
    .eq("status", "PUBLISHED")
    .order("start_date", { ascending: true });

  const events = (data ?? []) as EventWithTickets[];
  const dict = getDictionary(settings.language);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-lg">{dict["seller.title"]}</h1>
          <p className="text-xs text-muted-foreground">{profile?.name ?? profile?.email}</p>
        </div>
        <a href="/dashboard" className="text-xs text-muted-foreground underline">{dict["seller.dashboard"]}</a>
      </div>
      <SellerApp events={events} sellerId={profile!.id} dict={dict} doorMode={doorMode} />
    </div>
  );
}
