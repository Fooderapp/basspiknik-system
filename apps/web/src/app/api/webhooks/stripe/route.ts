import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { headers } from "next/headers";
import { fromStripeAmount, type Currency } from "@/lib/settings";
import { fulfillTicketOrder } from "@/lib/fulfill";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(req: Request) {
  const body = await req.text();
  const sig = (await headers()).get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  let event: ReturnType<typeof stripe.webhooks.constructEvent>;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ── Web: Stripe Checkout session completed ──────────────────────────────────
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const meta = session.metadata ?? {};
    const currency = ((meta.currency as Currency) || "EUR");

    const result = await fulfillTicketOrder({
      eventId: meta.eventId,
      userId: meta.userId || null,
      guestEmail: meta.guestEmail || null,
      guestName: meta.guestName || null,
      items: JSON.parse(meta.items ?? "[]"),
      promoCodeId: meta.promoCodeId || null,
      currency,
      discountAmount: parseFloat(meta.discountAmount ?? "0"),
      taxAmount: parseFloat(meta.taxAmount ?? "0"),
      total: fromStripeAmount(session.amount_total ?? 0, currency),
      customerEmail: session.customer_email,
      customerName: (session.customer_details as any)?.name ?? null,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ received: true, ...result });
  }

  // ── Mobile: native PaymentSheet (PaymentIntent) succeeded ───────────────────
  // Web Checkout Sessions also emit payment_intent.succeeded — only process PIs
  // explicitly tagged by the mobile app to avoid double order creation.
  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object;
    const meta = pi.metadata ?? {};
    if (meta.source !== "mobile_native") {
      return NextResponse.json({ received: true, skipped: "not_mobile_native" });
    }

    const currency = ((meta.currency as Currency) || "HUF");

    const result = await fulfillTicketOrder({
      eventId: meta.eventId,
      userId: meta.userId || null,
      guestEmail: meta.guestEmail || null,
      guestName: meta.guestName || null,
      items: JSON.parse(meta.items ?? "[]"),
      promoCodeId: meta.promoCodeId || null,
      currency,
      discountAmount: parseFloat(meta.discountAmount ?? "0"),
      taxAmount: parseFloat(meta.taxAmount ?? "0"),
      total: fromStripeAmount(pi.amount_received ?? pi.amount ?? 0, currency),
      customerEmail: (pi.receipt_email as string) ?? null,
      stripePaymentIntentId: pi.id,
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ received: true, ...result });
  }

  return NextResponse.json({ received: true });
}
