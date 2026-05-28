import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TicketTypeManager } from "@/components/events/ticket-type-manager";
import { CalendarDays, MapPin, Users, ExternalLink, Pencil, BarChart3, Ticket, Tag, Code2 } from "lucide-react";
import { EmbedSnippet } from "@/components/events/embed-snippet";
import type { Event, TicketType } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline" | "success"> = {
  PUBLISHED: "success",
  DRAFT: "secondary",
  CANCELLED: "destructive",
  ARCHIVED: "outline",
};

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await getCurrentProfile(); // auth guard (layout handles redirect)

  const supabase = await createClient() as any;
  const { data } = await supabase
    .from("events")
    .select("*, ticket_types(*)")
    .eq("id", id)
    .single();

  if (!data) notFound();

  const event = data as Event & { ticket_types: TicketType[] };
  const ticketTypes = event.ticket_types ?? [];

  const totalSold = ticketTypes.reduce((s, t) => s + t.sold, 0);
  const totalCapacity = ticketTypes.reduce((s, t) => s + t.quantity, 0);
  const grossRevenue = ticketTypes.reduce((s, t) => s + t.sold * t.price, 0);
  const capacityPct = totalCapacity > 0 ? Math.round((totalSold / totalCapacity) * 100) : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard/events" className="hover:text-foreground transition-colors">Events</Link>
        <span>/</span>
        <span className="text-foreground font-medium truncate">{event.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{event.name}</h1>
            <Badge variant={STATUS_VARIANT[event.status] ?? "secondary"}>{event.status}</Badge>
          </div>
          {event.description && <p className="text-muted-foreground">{event.description}</p>}
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground pt-1">
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatDate(event.start_date)}
              {event.end_date && ` — ${formatDate(event.end_date)}`}
            </span>
            {event.venue && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {event.venue}{event.address && `, ${event.address}`}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              Capacity {event.capacity}
            </span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {event.status === "PUBLISHED" && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/events/${event.slug}`} target="_blank">
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Public Page
              </Link>
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/events/${id}/promos`}>
              <Tag className="h-3.5 w-3.5 mr-1" /> Promo Codes
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/events/${id}/edit`}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit Event
            </Link>
          </Button>
        </div>
      </div>

      {/* Cover image */}
      {event.cover_image_url && (
        <div className="w-full rounded-xl overflow-hidden border">
          {/* Desktop: fixed 400px height, natural aspect ratio */}
          <div className="hidden sm:block w-full h-[400px]">
            <img src={event.cover_image_url} alt={event.name} className="w-full h-full object-cover object-center" />
          </div>
          {/* Mobile: 1:1 centre-crop */}
          <div className="sm:hidden w-full aspect-square">
            <img src={event.cover_image_url} alt={event.name} className="w-full h-full object-cover object-center" />
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Ticket, label: "Tickets Sold", value: `${totalSold} / ${totalCapacity}` },
          { icon: BarChart3, label: "Capacity", value: `${capacityPct}%` },
          { icon: Users, label: "Gross Revenue", value: formatCurrency(grossRevenue) },
          { icon: CalendarDays, label: "Ticket Types", value: ticketTypes.length },
        ].map(({ icon: Icon, label, value }) => (
          <Card key={label}>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" /> {label}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-xl font-bold">{value}</p>
              {label === "Capacity" && totalCapacity > 0 && (
                <div className="h-1 rounded-full bg-muted mt-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${capacityPct >= 100 ? "bg-destructive" : capacityPct >= 80 ? "bg-amber-500" : "bg-primary"}`}
                    style={{ width: `${Math.min(capacityPct, 100)}%` }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Ticket type manager */}
      <TicketTypeManager eventId={id} initialTicketTypes={ticketTypes} />

      {/* Embed widget snippet */}
      {event.status === "PUBLISHED" && (
        <EmbedSnippet slug={event.slug} />
      )}
    </div>
  );
}
