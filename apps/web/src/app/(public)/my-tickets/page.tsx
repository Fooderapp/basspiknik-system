import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { formatDate } from "@/lib/utils";
import { Ticket, CalendarDays, MapPin, QrCode } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const metadata = { title: "My Tickets" };

const TIER_COLORS: Record<string, string> = {
  VIP:        "bg-purple-100 text-purple-800 border-purple-200",
  EARLY_BIRD: "bg-blue-100 text-blue-800 border-blue-200",
  GENERAL:    "bg-gray-100 text-gray-800 border-gray-200",
  LATE:       "bg-orange-100 text-orange-800 border-orange-200",
  DOOR:       "bg-amber-100 text-amber-800 border-amber-200",
  FREE:       "bg-green-100 text-green-800 border-green-200",
};

export default async function MyTicketsPage() {
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in?redirectTo=/my-tickets");

  // Fetch orders with tickets and event info
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
        <div className="flex items-center gap-3 mb-8">
          <Ticket className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-bold">My Tickets</h1>
        </div>

        {allOrders.length === 0 ? (
          <div className="rounded-xl border border-dashed p-12 text-center">
            <Ticket className="h-10 w-10 mx-auto mb-4 text-muted-foreground/40" />
            <p className="text-muted-foreground font-medium">No tickets yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Tickets you purchase will appear here.
            </p>
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
                        <Image
                          src={event.cover_image_url}
                          alt={event.name}
                          fill
                          className="object-cover"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{event?.name ?? "Event"}</p>
                      <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                        {event?.start_date && (
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {formatDate(event.start_date)}
                          </span>
                        )}
                        {event?.venue && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {event.venue}
                          </span>
                        )}
                      </div>
                    </div>
                    {isPast && (
                      <Badge variant="secondary" className="shrink-0 text-xs">Past</Badge>
                    )}
                  </div>

                  {/* Tickets */}
                  <div className="divide-y">
                    {tickets.map((ticket: any) => (
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
                        </div>

                        <div className="shrink-0 text-right">
                          {ticket.status === "USED" ? (
                            <Badge variant="secondary" className="text-xs">Used</Badge>
                          ) : ticket.status === "CANCELLED" ? (
                            <Badge variant="destructive" className="text-xs">Cancelled</Badge>
                          ) : (
                            <Badge variant="success" className="text-xs">Valid</Badge>
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
