import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { formatDate } from "@/lib/utils";
import { Ticket, CalendarDays, MapPin, QrCode } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { getDictionary, t } from "@/lib/i18n";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const metadata = { title: "My Tickets" };

const TIER_COLORS: Record<string, string> = {
  VIP:        "bg-foreground text-background border-transparent",
  EARLY_BIRD: "bg-muted text-foreground border-border",
  GENERAL:    "bg-muted text-foreground border-border",
  LATE:       "bg-muted text-foreground border-border",
  DOOR:       "bg-muted text-foreground border-border",
  FREE:       "bg-muted text-muted-foreground border-border",
};

export default async function MyTicketsPage() {
  const supabase = await createClient() as any;
  const [{ data: { user } }, settings] = await Promise.all([
    supabase.auth.getUser(),
    getSettings(),
  ]);

  if (!user) redirect("/sign-in?redirectTo=/my-tickets");

  const dict = getDictionary(settings.language);

  const { data: orders } = await supabase
    .from("orders")
    .select(`
      id, total, currency, created_at, status,
      events ( id, name, slug, start_date, end_date, venue, cover_image_url ),
      tickets ( id, qr_code, ticket_name, tier, status, holder_name, used_at )
    `)
    .eq("user_id", user.id)
    .eq("status", "PAID")
    .order("created_at", { ascending: false });

  const allOrders = (orders ?? []) as any[];

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-3xl py-10 px-4">
        <div className="flex items-center gap-3 mb-2">
          <Ticket className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-bold">{t(dict, "mytickets.title")}</h1>
        </div>
        <p className="text-muted-foreground mb-8">{t(dict, "mytickets.subtitle")}</p>

        {allOrders.length === 0 ? (
          <div className="rounded-xl border border-dashed p-12 text-center">
            <Ticket className="h-10 w-10 mx-auto mb-4 text-muted-foreground/40" />
            <p className="text-muted-foreground font-medium">{t(dict, "mytickets.empty")}</p>
            <p className="text-sm text-muted-foreground mt-1">{t(dict, "mytickets.empty_sub")}</p>
            <Button asChild className="mt-6" variant="outline">
              <Link href="/events">{t(dict, "mytickets.browse")}</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {allOrders.map((order: any) => {
              const event = order.events;
              const tickets = (order.tickets ?? []) as any[];
              const isPast = event?.start_date && new Date(event.start_date) < new Date();

              return (
                <div key={order.id} className={`rounded-xl border bg-card overflow-hidden ${isPast ? "opacity-70" : ""}`}>
                  {/* Event header */}
                  <div className="flex items-center gap-4 p-4 border-b bg-muted/30">
                    {event?.cover_image_url && (
                      <div className="relative h-14 w-20 rounded-md overflow-hidden shrink-0">
                        <Image src={event.cover_image_url} alt={event.name} fill className="object-cover" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{event?.name ?? "Event"}</p>
                      <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                        {event?.start_date && (
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />{formatDate(event.start_date)}
                          </span>
                        )}
                        {event?.venue && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />{event.venue}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      {isPast && <Badge variant="secondary" className="text-xs">Past</Badge>}
                      <p className="text-xs text-muted-foreground font-mono">
                        {t(dict, "mytickets.order_id")}: {order.id.slice(0, 8).toUpperCase()}
                      </p>
                    </div>
                  </div>

                  {/* Tickets */}
                  <div className="divide-y">
                    {tickets.map((ticket: any, i: number) => (
                      <div key={ticket.id} className="flex items-center gap-4 p-4">
                        {/* QR code */}
                        <div className="shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/tickets/qr?code=${encodeURIComponent(ticket.qr_code)}`}
                            alt="QR Code"
                            width={72}
                            height={72}
                            className="rounded-md border"
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-medium text-sm">{ticket.ticket_name ?? "Ticket"}</span>
                            {ticket.tier && (
                              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${TIER_COLORS[ticket.tier] ?? TIER_COLORS.GENERAL}`}>
                                {ticket.tier.replace("_", " ")}
                              </span>
                            )}
                          </div>
                          {ticket.holder_name && (
                            <p className="text-xs text-muted-foreground">{ticket.holder_name}</p>
                          )}
                          <p className="text-xs font-mono text-muted-foreground mt-1 truncate">{ticket.qr_code}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {i + 1} {t(dict, "mytickets.ticket_of")} {tickets.length}
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          {ticket.status === "USED" ? (
                            <Badge variant="secondary" className="text-xs">{t(dict, "mytickets.status_used")}</Badge>
                          ) : ticket.status === "CANCELLED" ? (
                            <Badge variant="destructive" className="text-xs">{t(dict, "mytickets.status_cancelled")}</Badge>
                          ) : (
                            <Badge variant="success" className="text-xs">{t(dict, "mytickets.status_valid")}</Badge>
                          )}
                          {ticket.used_at && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(ticket.used_at).toLocaleTimeString()}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}

                    {tickets.length === 0 && (
                      <div className="p-4 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                        <QrCode className="h-4 w-4" />
                        Tickets generating…
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
