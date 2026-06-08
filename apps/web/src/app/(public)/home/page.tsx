import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { CalendarDays, MapPin, Ticket as TicketIcon, ChevronRight, Star, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getSettings } from "@/lib/settings";
import { getDictionary, t } from "@/lib/i18n";
import type { Dictionary } from "@/lib/i18n";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const metadata = { title: "Home" };

const STRIPE: Record<string, string> = {
  VALID: "#9FE870", USED: "#6b7280", CANCELLED: "#ef4444", REFUNDED: "#a1a1aa",
};

function statusLabel(dict: Dictionary, s: string): string {
  switch (s) {
    case "VALID": return t(dict, "mytickets.status_valid");
    case "USED": return t(dict, "mytickets.status_used");
    case "CANCELLED": return t(dict, "mytickets.status_cancelled");
    case "REFUNDED": return t(dict, "mytickets.status_refunded");
    default: return s;
  }
}

export default async function HomePage() {
  const supabase = await createClient() as any;
  const [{ data: { user } }, settings] = await Promise.all([
    supabase.auth.getUser(),
    getSettings(),
  ]);
  if (!user) redirect("/sign-in?redirectTo=/home");

  const dict = getDictionary(settings.language);

  const [{ data: prof }, { data: balance }, { data: owned }, { data: transferred }] = await Promise.all([
    supabase.from("profiles").select("name").eq("id", user.id).single(),
    supabase.rpc("get_credit_balance", { p_user_id: user.id }),
    supabase
      .from("tickets")
      .select("id, status, ticket_name, tier, orders!inner(user_id), events(name, venue, start_date)")
      .eq("orders.user_id", user.id)
      .eq("status", "VALID"),
    supabase
      .from("tickets")
      .select("id, status, ticket_name, tier, events(name, venue, start_date)")
      .eq("transferred_to_user_id", user.id)
      .eq("status", "VALID"),
  ]);

  const seen = new Set<string>();
  const tickets = [...(owned ?? []), ...(transferred ?? [])]
    .filter((tk: any) => (seen.has(tk.id) ? false : (seen.add(tk.id), true)))
    .sort((a: any, b: any) => {
      const ad = a.events?.start_date ? new Date(a.events.start_date).getTime() : Infinity;
      const bd = b.events?.start_date ? new Date(b.events.start_date).getTime() : Infinity;
      return ad - bd;
    });

  const credits = typeof balance === "number" ? balance : 0;
  const firstName = (prof?.name ?? user.email ?? "").split(/[ @]/)[0];

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-6 md:py-10">
      {/* Greeting + small credit chip */}
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{t(dict, "dash.greeting")}</p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{firstName}</h1>
        </div>
        <Link
          href="/events"
          className="flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5"
        >
          <Star className="h-3.5 w-3.5 fill-gold text-gold" strokeWidth={2} />
          <span className="text-sm font-semibold text-gold">{credits}</span>
          <span className="text-xs text-gold/70">{t(dict, "profile.credits")}</span>
        </Link>
      </div>

      {/* Tickets — primary focus */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight">{t(dict, "nav.tickets")}</h2>
        <Link href="/my-tickets" className="text-xs font-medium text-muted-foreground hover:text-foreground">
          {t(dict, "dash.all_tickets")} →
        </Link>
      </div>

      {tickets.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border py-12 text-center">
          <TicketIcon className="mb-3 h-9 w-9 text-muted-foreground/40" />
          <p className="font-semibold">{t(dict, "mytickets.empty")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t(dict, "dash.no_next_sub")}</p>
          <Button asChild className="mt-5">
            <Link href="/events">{t(dict, "dash.browse")}</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {tickets.map((tk: any) => (
            <Link
              key={tk.id}
              href={`/tickets/${tk.id}`}
              className="relative flex items-center gap-4 overflow-hidden rounded-xl border border-border bg-card p-4 transition-colors hover:border-gold/40"
            >
              <span className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: STRIPE[tk.status] ?? "#6b7280" }} />
              <div className="ml-1 flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-secondary">
                <TicketIcon className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold tracking-tight">{tk.events?.name ?? tk.ticket_name ?? "Ticket"}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge variant="success" className="text-xs">{statusLabel(dict, tk.status)}</Badge>
                  {tk.events?.start_date && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarDays className="h-3 w-3" />{formatDate(tk.events.start_date)}
                    </span>
                  )}
                  {tk.events?.venue && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" /><span className="line-clamp-1">{tk.events.venue}</span>
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.75} />
            </Link>
          ))}

          <Button asChild variant="outline" className="mt-1 gap-2">
            <Link href="/events"><Plus className="h-4 w-4" />{t(dict, "dash.browse")}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
