import { NextResponse } from "next/server";
import { z } from "zod";
import { stripe, formatStripeAmount } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import type { Event, TicketType, PromoCode, Profile } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const checkoutSchema = z.object({
  eventId: z.string(),
  items: z.array(z.object({ ticketTypeId: z.string(), quantity: z.number().min(1) })),
  promoCode: z.string().optional(),
  guestEmail: z.string().email().optional(),
  guestName: z.string().optional(),
});

/** Derive the base URL from the request so it works on localhost, LAN, and production.
 *  NEXT_PUBLIC_APP_URL always wins — required on production (Stripe rejects private IPs).
 *  For local mobile testing use ngrok and set NEXT_PUBLIC_APP_URL to the ngrok URL. */
function getBaseUrl(req: Request): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const host = req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function POST(req: Request) {
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();

  const body = await req.json();
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { eventId, items, promoCode, guestEmail, guestName } = parsed.data;

  const { data: eventData } = await supabase.from("events").select("*, ticket_types(*)").eq("id", eventId).eq("status", "PUBLISHED").single();
  const event = eventData as (Event & { ticket_types: TicketType[] }) | null;
  if (!event) return NextResponse.json({ error: "Event not available" }, { status: 400 });

  let subtotal = 0;
  const lineItems: object[] = [];

  for (const item of items) {
    const ticketType = event.ticket_types.find((t) => t.id === item.ticketTypeId);
    if (!ticketType) return NextResponse.json({ error: "Ticket type not found" }, { status: 400 });
    const available = ticketType.quantity - ticketType.sold;
    if (available < item.quantity) return NextResponse.json({ error: `Not enough ${ticketType.name} tickets` }, { status: 400 });
    subtotal += ticketType.price * item.quantity;
    lineItems.push({
      price_data: { currency: "eur", product_data: { name: `${event.name} — ${ticketType.name}` }, unit_amount: formatStripeAmount(ticketType.price) },
      quantity: item.quantity,
    });
  }

  let discountAmount = 0;
  let promoCodeId = "";
  if (promoCode) {
    const { data: pc } = await supabase.from("promo_codes").select("*").eq("code", promoCode).maybeSingle();
    const promo = pc as PromoCode | null;
    if (promo) {
      if (promo.usage_limit && promo.used_count >= promo.usage_limit) return NextResponse.json({ error: "Promo code usage limit reached" }, { status: 400 });
      if (promo.expires_at && new Date(promo.expires_at) < new Date()) return NextResponse.json({ error: "Promo code expired" }, { status: 400 });
      discountAmount = promo.discount_type === "percent" ? subtotal * (promo.discount_value / 100) : promo.discount_value;
      promoCodeId = promo.id;
    }
  }

  let profileEmail = guestEmail;
  if (user && !promoCode) {
    const { data: profileData } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    const profile = profileData as Profile | null;
    if (profile?.loyalty_discount) discountAmount = subtotal * 0.1;
    profileEmail = profile?.email ?? guestEmail;
  }

  const taxAmount = subtotal * (event.tax_rate / 100);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: lineItems as any,
    mode: "payment",
    success_url: `${getBaseUrl(req)}/events/${event.slug}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${getBaseUrl(req)}/events/${event.slug}`,
    customer_email: profileEmail,
    metadata: {
      eventId, userId: user?.id ?? "", guestEmail: guestEmail ?? "", guestName: guestName ?? "",
      items: JSON.stringify(items), promoCodeId,
      discountAmount: discountAmount.toString(), taxAmount: taxAmount.toString(),
    },
  });

  return NextResponse.json({ url: session.url });
}
