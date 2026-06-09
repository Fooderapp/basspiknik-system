import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";
import { getConfig } from "@/lib/config";
import { getSettings, toStripeAmount } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/server";
import type { Event, TicketType, PromoCode, Profile } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const schema = z.object({
  eventId: z.string(),
  items: z.array(z.object({ ticketTypeId: z.string(), quantity: z.number().min(1) })),
  promoCode: z.string().optional(),
});

/** Mobile-only: build a Stripe PaymentIntent + ephemeral key + customer for the
 *  native PaymentSheet. Bearer-token authed (the mobile app is always signed in).
 *  Tickets are created by the payment_intent.succeeded webhook (source=mobile_native). */
export async function POST(req: Request) {
  try {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { eventId, items, promoCode } = parsed.data;

  const settings = await getSettings();
  const currency = settings.currency;

  const admin = await createAdminClient() as any;

  const { data: eventData } = await admin
    .from("events").select("*, ticket_types(*)").eq("id", eventId).eq("status", "PUBLISHED").single();
  const event = eventData as (Event & { ticket_types: TicketType[] }) | null;
  if (!event) return NextResponse.json({ error: "Event not available" }, { status: 400 });

  let subtotal = 0;
  for (const item of items) {
    const tt = event.ticket_types.find((t) => t.id === item.ticketTypeId);
    if (!tt) return NextResponse.json({ error: "Ticket type not found" }, { status: 400 });
    if ((tt as any).is_door_ticket) return NextResponse.json({ error: "Door tickets are POS-only" }, { status: 400 });
    const available = tt.quantity - tt.sold;
    if (available < item.quantity) return NextResponse.json({ error: `Not enough ${tt.name} tickets` }, { status: 400 });
    const unitPrice = tt.sale_enabled && tt.sale_price != null ? tt.sale_price : tt.price;
    subtotal += unitPrice * item.quantity;
  }

  let discountAmount = 0;
  let promoCodeId = "";
  if (promoCode) {
    const { data: pc } = await admin.from("promo_codes").select("*").eq("code", promoCode).maybeSingle();
    const promo = pc as PromoCode | null;
    if (promo) {
      if (promo.usage_limit && promo.used_count >= promo.usage_limit) return NextResponse.json({ error: "Promo code usage limit reached" }, { status: 400 });
      if (promo.expires_at && new Date(promo.expires_at) < new Date()) return NextResponse.json({ error: "Promo code expired" }, { status: 400 });
      discountAmount = promo.discount_type === "percent" ? subtotal * (promo.discount_value / 100) : promo.discount_value;
      promoCodeId = promo.id;
    }
  }

  const { data: profileData } = await admin.from("profiles").select("*").eq("id", user.id).single();
  const profile = profileData as Profile | null;
  if (profile?.loyalty_discount && !promoCode) discountAmount = subtotal * 0.1;

  const taxAmount = subtotal * (event.tax_rate / 100);
  const total = Math.max(0, subtotal - discountAmount + taxAmount);
  const buyerEmail = profile?.email ?? user.email ?? null;
  const buyerName = profile?.billing_name ?? profile?.name ?? null;

  // Reuse or create a Stripe customer keyed off the profile.
  const stripe = await getStripe();
  let customerId = (profile as any)?.stripe_customer_id as string | undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: buyerEmail ?? undefined,
      name: buyerName ?? undefined,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  const ephemeralKey = await stripe.ephemeralKeys.create(
    { customer: customerId },
    { apiVersion: "2025-02-24.acacia" },
  );

  const paymentIntent = await stripe.paymentIntents.create({
    amount: toStripeAmount(total, currency),
    currency: currency.toLowerCase(),
    customer: customerId,
    receipt_email: buyerEmail ?? undefined,
    automatic_payment_methods: { enabled: true },
    metadata: {
      source: "mobile_native",
      eventId,
      userId: user.id,
      guestEmail: "",
      guestName: buyerName ?? "",
      items: JSON.stringify(items),
      promoCodeId,
      currency,
      discountAmount: discountAmount.toString(),
      taxAmount: taxAmount.toString(),
    },
  });

  return NextResponse.json({
    paymentIntent: paymentIntent.client_secret,
    ephemeralKey: ephemeralKey.secret,
    customer: customerId,
    publishableKey: await getConfig("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"),
    total,
    currency,
  });
  } catch (err: any) {
    console.error("[orders/payment-intent]", err);
    return NextResponse.json({ error: err.message ?? "Internal error" }, { status: 500 });
  }
}
