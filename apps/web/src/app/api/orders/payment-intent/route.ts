import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";
import { getConfig } from "@/lib/config";
import { getSettings, toStripeAmount } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/server";
import { computeRedemption } from "@/lib/credits";
import type { Event, TicketType, PromoCode, Profile } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const schema = z.object({
  eventId: z.string(),
  items: z.array(z.object({ ticketTypeId: z.string(), quantity: z.number().min(1) })),
  promoCode: z.string().optional(),
  promoId: z.string().optional(),
  creditsToApply: z.number().int().min(0).optional(),
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
  const { eventId, items, promoCode, promoId, creditsToApply } = parsed.data;

  const settings = await getSettings();
  const currency = settings.currency;

  const admin = createAdminClient() as any;

  const { data: eventData } = await admin
    .from("events").select("*, ticket_types(*)").eq("id", eventId).eq("status", "PUBLISHED").single();
  const event = eventData as (Event & { ticket_types: TicketType[] }) | null;
  if (!event) return NextResponse.json({ error: "Event not available" }, { status: 400 });

  let subtotal = 0;
  for (const item of items) {
    const tt = event.ticket_types.find((t) => t.id === item.ticketTypeId);
    if (!tt) return NextResponse.json({ error: "Ticket type not found" }, { status: 400 });
    if ((tt as any).is_door_ticket) return NextResponse.json({ error: "Door tickets are POS-only" }, { status: 400 });
    const vt = tt as any;
    if (vt.is_visible === false
      || (vt.visible_from && new Date(vt.visible_from) > new Date())
      || (vt.visible_until && new Date(vt.visible_until) < new Date())) {
      return NextResponse.json({ error: `${tt.name} is not available` }, { status: 400 });
    }
    const available = tt.quantity - tt.sold;
    if (available < item.quantity) return NextResponse.json({ error: `Not enough ${tt.name} tickets` }, { status: 400 });
    const unitPrice = tt.sale_enabled && tt.sale_price != null ? tt.sale_price : tt.price;
    subtotal += unitPrice * item.quantity;
  }

  // Promo + credits are mutually exclusive (either-or).
  if (creditsToApply && creditsToApply > 0 && (promoCode || promoId)) {
    return NextResponse.json({ error: "Use either a promo code or credits, not both" }, { status: 400 });
  }

  let discountAmount = 0;
  let promoCodeId = "";
  if (promoCode || promoId) {
    const { data: pc } = promoId
      ? await admin.from("promo_codes").select("*").eq("id", promoId).maybeSingle()
      : await admin.from("promo_codes").select("*").eq("code", promoCode!).maybeSingle();
    const promo = pc as PromoCode | null;
    if (promo) {
      if (promo.event_id && promo.event_id !== eventId) return NextResponse.json({ error: "Promo code not valid for this event" }, { status: 400 });
      if (promo.usage_limit && promo.used_count >= promo.usage_limit) return NextResponse.json({ error: "Promo code usage limit reached" }, { status: 400 });
      if (promo.expires_at && new Date(promo.expires_at) < new Date()) return NextResponse.json({ error: "Promo code expired" }, { status: 400 });
      discountAmount = promo.discount_type === "percent" ? subtotal * (promo.discount_value / 100) : promo.discount_value;
      promoCodeId = promo.id;
    }
  }

  // ── Credit redemption (reduces the charged amount directly) ──
  let creditsApplied = 0;
  let creditDiscount = 0;
  if (creditsToApply && creditsToApply > 0) {
    const r = await computeRedemption(admin, user.id, subtotal, creditsToApply);
    creditsApplied = r.credits;
    creditDiscount = r.discount;
  }

  const { data: profileData } = await admin.from("profiles").select("*").eq("id", user.id).single();
  const profile = profileData as Profile | null;
  // loyalty_discount is tracked for reporting but NOT deducted from the charge —
  // this matches the web Stripe Checkout flow which also doesn't apply it to line_items.
  const loyaltyDiscount = (profile?.loyalty_discount && !promoCode) ? subtotal * 0.1 : 0;

  // Ticket prices in Hungary are tax-inclusive; taxAmount is metadata only.
  // Charged total = subtotal minus promo discount OR credit discount (either-or).
  const total = Math.max(0, subtotal - discountAmount - creditDiscount);
  const buyerEmail = profile?.email ?? user.email ?? null;
  const buyerName = profile?.billing_name ?? profile?.name ?? null;

  // Reuse or create a Stripe customer keyed off the profile.
  // When the Stripe account changes, the stored customer ID no longer exists —
  // catch that case and create a fresh customer in the new account.
  const stripe = await getStripe();
  let customerId = (profile as any)?.stripe_customer_id as string | undefined;
  if (customerId) {
    try {
      const existing = await stripe.customers.retrieve(customerId);
      if ((existing as any).deleted) customerId = undefined; // deleted customer — recreate
    } catch {
      customerId = undefined; // "No such customer" in new account — recreate
    }
  }
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
      discountAmount: (discountAmount + creditDiscount + loyaltyDiscount).toString(),
      taxAmount: String(Math.round(subtotal * ((event.tax_rate ?? 0) / 100))),
      creditsApplied: String(creditsApplied),
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
