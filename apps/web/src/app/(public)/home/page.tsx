import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { CalendarDays, MapPin, Ticket as TicketIcon, ChevronRight, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSettings } from "@/lib/settings";
import { getDictionary, t } from "@/lib/i18n";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const metadata = { title: "Home" };

export default async function HomePage() {
  const supabase = await createClient() as any;
  const [{ data: { user } }, settings] = await Promise.all([
    supabase.auth.getUser(),
    getSettings(),
  ]);
  if (!user) redirect("/sign-in?redirectTo=/home");

  const dict = getDictionary(settings.language);

  const [{ data: prof }, { data: owned }, { data: transferred }] = await Promise.all([
    supabase.from("profiles").select("name").eq("id", user.id).single(),
    supabase
      .from("tickets")
      .select("*, orders!inner(user_id), events(name, venue, start_date, cover_image_url)")
      .eq("orders.user_id", user.id)
      .eq("status", "VALID"),
    supabase
      .from("tickets")
      .select("*, events(name, venue, start_date, cover_image_url)")
      .eq("transferred_to_user_id", user.id)
      .eq("status", "VALID"),
  ]);

  const now = Date.now();
  const seen = new Set<string>();
  const all = [...(owned ?? []), ...(transferred ?? [])].filter((tk: any) =>
    seen.has(tk.id) ? false : (seen.add(tk.id), true),
  );
  const validCount = all.length;
  const upcoming = all
    .filter((tk: any) => tk.events?.start_date && new Date(tk.events.start_date).getTime() >= now)
    .sort((a: any, b: any) => new Date(a.events.start_date).getTime() - new Date(b.events.start_date).getTime());
  const next = upcoming[0] ?? null;
  const firstName = (prof?.name ?? user.email ?? "").split(/[ @]/)[0];

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-6 md:py-10">
      {/* Greeting */}
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">{t(dict, "dash.greeting")}</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{firstName}</h1>
      </div>

      {/* Next event */}
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t(dict, "dash.next_event")}
      </p>

      {next ? (
        <Link
          href={`/tickets/${next.id}`}
          className="group block overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-gold/40"
        >
          {next.events?.cover_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={next.events.cover_image_url} alt={next.events?.name ?? ""} className="h-40 w-full object-cover" />
          )}
          <div className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gold text-gold-foreground">
              <QrCode className="h-6 w-6" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-bold tracking-tight">{next.events?.name ?? "Event"}</p>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {formatDate(next.events.start_date)}
                </span>
                {next.events?.venue && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="line-clamp-1">{next.events.venue}</span>
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs font-medium text-gold">{t(dict, "dash.view_ticket")} →</p>
            </div>
          </div>
        </Link>
      ) : (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border py-12 text-center">
          <CalendarDays className="mb-3 h-9 w-9 text-muted-foreground/40" />
          <p className="font-semibold">{t(dict, "dash.no_next")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t(dict, "dash.no_next_sub")}</p>
          <Button asChild className="mt-5">
            <Link href="/events">{t(dict, "dash.browse")}</Link>
          </Button>
        </div>
      )}

      {/* All tickets shortcut (Tickets is no longer a tab) */}
      <Link
        href="/my-tickets"
        className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-gold/40"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
          <TicketIcon className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="flex-1">
          <p className="font-semibold">{t(dict, "dash.all_tickets")}</p>
          <p className="text-xs text-muted-foreground">
            {validCount} {t(dict, "dash.tickets_count")}
          </p>
        </div>
        <ChevronRight className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.75} />
      </Link>
    </div>
  );
}
