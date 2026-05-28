import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { formatDate, formatCurrency } from "@/lib/utils";
import { CheckCircle2, CalendarDays, MapPin, Download, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Event } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default async function SuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { slug } = await params;
  const { session_id } = await searchParams;

  if (!session_id) redirect(`/events/${slug}`);

  // Fetch Stripe session
  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.retrieve>> | null = null;
  try {
    session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["line_items"],
    });
  } catch {
    redirect(`/events/${slug}`);
  }

  if (session.payment_status !== "paid") redirect(`/events/${slug}`);

  // Fetch event
  const supabase = await createClient() as any;
  const { data: eventData } = await supabase
    .from("events")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!eventData) notFound();
  const event = eventData as Event;

  // Fetch tickets for this order (by stripe session)
  const { data: orderData } = await supabase
    .from("orders")
    .select("*, order_items(*, ticket_types(name, tier)), tickets(qr_code, ticket_name, tier, holder_name)")
    .eq("stripe_checkout_session_id", session_id)
    .maybeSingle();

  const totalAmount = (session.amount_total ?? 0) / 100;
  const lineItems = session.line_items?.data ?? [];

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-2xl py-12 px-4 space-y-8">

        {/* Success header */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="rounded-full bg-green-100 dark:bg-green-900 p-5">
              <CheckCircle2 className="h-14 w-14 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <h1 className="text-3xl font-bold">You're in!</h1>
          <p className="text-muted-foreground">
            Your tickets for <strong>{event.name}</strong> are confirmed.
            {session.customer_email && (
              <> A confirmation email was sent to <strong>{session.customer_email}</strong>.</>
            )}
          </p>
        </div>

        {/* Event info card */}
        <div className="rounded-xl border bg-card p-5 space-y-3">
          {event.cover_image_url && (
            <div className="w-full h-40 rounded-lg overflow-hidden mb-4">
              <img src={event.cover_image_url} alt={event.name} className="w-full h-full object-cover object-center" />
            </div>
          )}
          <h2 className="text-xl font-bold">{event.name}</h2>
          <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 shrink-0" />
              {formatDate(event.start_date)}
              {event.end_date && ` — ${formatDate(event.end_date)}`}
            </span>
            {event.venue && (
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0" />
                {event.venue}{event.address && `, ${event.address}`}
              </span>
            )}
          </div>
        </div>

        {/* Order summary */}
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h3 className="font-semibold">Order Summary</h3>

          <div className="space-y-2">
            {lineItems.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{item.description}</span>
                <span className="font-medium">{formatCurrency((item.amount_total ?? 0) / 100)}</span>
              </div>
            ))}
          </div>

          <div className="border-t pt-3 flex justify-between font-bold">
            <span>Total paid</span>
            <span>{formatCurrency(totalAmount)}</span>
          </div>

          {orderData?.id && (
            <p className="text-xs text-muted-foreground">
              Order ID: <span className="font-mono">{orderData.id.slice(0, 8).toUpperCase()}</span>
            </p>
          )}
        </div>

        {/* Tickets with QR */}
        {orderData?.tickets && orderData.tickets.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold">Your Tickets</h3>
            {orderData.tickets.map((ticket: any, i: number) => (
              <div key={ticket.qr_code} className="rounded-xl border bg-card p-4 flex items-center gap-4">
                {/* QR via API */}
                <img
                  src={`/api/tickets/qr?code=${encodeURIComponent(ticket.qr_code)}`}
                  alt="QR Code"
                  className="w-20 h-20 rounded shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="font-semibold">{ticket.ticket_name ?? "Ticket"}</span>
                    <Badge variant="outline" className="text-[11px]">{ticket.tier}</Badge>
                  </div>
                  {ticket.holder_name && <p className="text-sm text-muted-foreground">{ticket.holder_name}</p>}
                  <p className="font-mono text-xs text-muted-foreground mt-1">{ticket.qr_code}</p>
                  <p className="text-xs text-muted-foreground">Ticket {i + 1} of {orderData.tickets.length}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button asChild variant="outline" className="flex-1">
            <Link href={`/events/${slug}`}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Event
            </Link>
          </Button>
          <Button asChild className="flex-1">
            <Link href="/events">Browse More Events</Link>
          </Button>
        </div>

      </div>
    </div>
  );
}
