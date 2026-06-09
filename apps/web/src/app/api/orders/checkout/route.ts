import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";
import { getSettings, toStripeAmount, fromStripeAmount } from "@/lib/settings";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sendTicketConfirmation } from "@/lib/email";
import type { Event, TicketType, PromoCode, Profile } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const checkoutSchema = z.object({
  eventId: z.string(),
  items: z.array(z.object({ ticketTypeId: z.string(), quantity: z.number().min(1) })),
  promoCode: z.string().optional(),
  guestEmail: z.string().email().optional(),
  guestName: z.string().optional(),
  freeSpinToken: z.string().optional(),
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

/** Resolve the buyer from a cookie session (web) or a Bearer token (mobile app). */
async function resolveUser(req: Request, cookieClient: any) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    const sb = createSbClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data: { user } } = await sb.auth.getUser(token);
    return user ?? null;
  }
  const { data: { user } } = await cookieClient.auth.getUser();
  return user ?? null;
}

export async function POST(req: Request) {
  const supabase = await createClient() as any;
  const user = await resolveUser(req, supabase);

  const body = await req.json();
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { eventId, items, promoCode, guestEmail, guestName, freeSpinToken } = parsed.data;

  // Load app settings to get active currency
  const settings = await getSettings();
  const currency = settings.currency;

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
    const unitPrice = ticketType.sale_enabled && ticketType.sale_price != null ? ticketType.sale_price : ticketType.price;
    subtotal += unitPrice * item.quantity;
    lineItems.push({
      price_data: {
        currency: currency.toLowerCase(),
        product_data: { name: `${event.name} — ${ticketType.name}` },
        unit_amount: toStripeAmount(unitPrice, currency),
      },
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
    // Admin read so it works for both cookie (web) and Bearer (mobile) sessions.
    const adminRead = await createAdminClient() as any;
    const { data: profileData } = await adminRead.from("profiles").select("*").eq("id", user.id).single();
    const profile = profileData as Profile | null;
    if (profile?.loyalty_discount) discountAmount = subtotal * 0.1;
    profileEmail = profile?.email ?? guestEmail;
  }

  const taxAmount = subtotal * (event.tax_rate / 100);

  // ── Free checkout via a winning spin token ──────────────────────────────────
  if (freeSpinToken) {
    if (!user) return NextResponse.json({ error: "Sign in to claim a free spin" }, { status: 401 });

    const admin = await createAdminClient() as any;

    // Atomic single-use redemption via service role.
    // Done here (not via the SECURITY DEFINER RPC) because mobile authenticates
    // with a Bearer token, so auth.uid() is NULL on the cookie client and the
    // RPC's ownership check would always fail. Conditional UPDATE guarantees
    // the token is owned, unused, not expired, and flips used=true atomically.
    const { data: redeem } = await admin
      .from("spin_wins")
      .update({ used: true })
      .eq("token", freeSpinToken)
      .eq("user_id", user.id)
      .eq("context", "TICKET")
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .select("id")
      .maybeSingle();
    if (!redeem) {
      return NextResponse.json({ error: "Invalid or expired spin token" }, { status: 400 });
    }
    const winId = redeem.id;
    const buyerEmail = profileEmail || guestEmail || null;

    const { data: order, error: orderErr } = await admin.from("orders").insert({
      event_id: eventId,
      user_id: user.id,
      guest_email: buyerEmail,
      guest_name: guestName ?? null,
      stripe_payment_intent_id: `FREE_SPIN_${Date.now()}`,
      subtotal,
      discount_amount: subtotal,
      tax_amount: 0,
      total: 0,
      currency,
      status: "PAID",
      payment_method: "ONLINE",
    }).select().single();
    if (orderErr || !order) return NextResponse.json({ error: "Order creation failed" }, { status: 500 });

    for (const item of items) {
      const tt = event.ticket_types.find((t) => t.id === item.ticketTypeId)!;
      const unitPrice = tt.sale_enabled && tt.sale_price != null ? tt.sale_price : tt.price;

      const { data: orderItem } = await admin.from("order_items").insert({
        order_id: order.id,
        ticket_type_id: item.ticketTypeId,
        quantity: item.quantity,
        unit_price: unitPrice,
        total: unitPrice * item.quantity,
      }).select().single();
      if (!orderItem) continue;

      const ticketsPerUnit = tt.is_bundle && tt.bundle_size ? tt.bundle_size : 1;
      const totalTickets = item.quantity * ticketsPerUnit;
      const ticketInserts = Array.from({ length: totalTickets }, (_, i) => ({
        order_id: order.id,
        order_item_id: orderItem.id,
        event_id: eventId,
        ticket_type_id: item.ticketTypeId,
        ticket_name: tt.name,
        tier: tt.tier,
        status: "VALID",
        holder_name: guestName ?? null,
        holder_email: buyerEmail,
        qr_code: `TKT-${order.id.slice(0,8).toUpperCase()}-${orderItem.id.slice(0,4).toUpperCase()}-${String(i+1).padStart(2,"0")}`,
      }));
      await admin.from("tickets").insert(ticketInserts);
      await admin.rpc("increment_ticket_sold", { p_ticket_type_id: item.ticketTypeId, p_amount: item.quantity });
    }

    // Tie the win record to the resulting order
    await admin.from("spin_wins").update({ used_order_id: order.id }).eq("id", winId);

    if (buyerEmail) {
      const { data: emailTickets } = await admin.from("tickets").select("*").eq("order_id", order.id);
      try {
        await sendTicketConfirmation({
          to: buyerEmail,
          buyerName: guestName || "Guest",
          eventName: event.name,
          eventDate: event.start_date,
          eventVenue: event.venue || undefined,
          eventBannerUrl: (event as any).banner_image_url ?? null,
          tickets: (emailTickets ?? []).map((t: any) => ({
            id: t.id, qrCode: t.qr_code, ticketName: t.ticket_name ?? "Ticket",
            tier: t.tier ?? "GENERAL", holderName: t.holder_name || undefined,
          })),
          total: 0,
          orderId: order.id,
          language: settings.language,
          currency,
        });
      } catch { /* email failure shouldn't block a free win */ }
    }

    return NextResponse.json({ url: `/my-tickets?free=1`, free: true });
  }

  const stripe = await getStripe();
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: lineItems as any,
    mode: "payment",
    billing_address_collection: "required",
    success_url: `${getBaseUrl(req)}/events/${event.slug}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${getBaseUrl(req)}/events/${event.slug}`,
    customer_email: profileEmail,
    metadata: {
      eventId, userId: user?.id ?? "", guestEmail: guestEmail ?? "", guestName: guestName ?? "",
      items: JSON.stringify(items), promoCodeId, currency,
      discountAmount: discountAmount.toString(), taxAmount: taxAmount.toString(),
    },
  });

  return NextResponse.json({ url: session.url });
}
