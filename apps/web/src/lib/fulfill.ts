import { createAdminClient } from "@/lib/supabase/server";
import { sendTicketConfirmation } from "@/lib/email";
import { getSettings, type Currency } from "@/lib/settings";
import { createBillingoInvoice, type BillingoLineItem } from "@/lib/billingo";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface FulfillInput {
  eventId: string;
  userId?: string | null;
  guestEmail?: string | null;
  guestName?: string | null;
  items: Array<{ ticketTypeId: string; quantity: number }>;
  promoCodeId?: string | null;
  currency: Currency;
  discountAmount: number;
  taxAmount: number;
  /** Final charged total (display units, not Stripe cents). */
  total: number;
  /** Buyer email when not a guest (e.g. from Stripe customer_details). */
  customerEmail?: string | null;
  /** Buyer name when not a guest (e.g. from Stripe customer_details). */
  customerName?: string | null;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
}

export interface FulfillResult {
  ok: boolean;
  orderId?: string;
  ticketsCreated: number;
  emailStatus: string;
  emailError?: string;
  buyerEmail?: string | null;
  error?: string;
}

/** Creates the order, order_items, tickets, invoice, awards credits, and sends
 *  the confirmation email for a paid ticket purchase. Shared by both the Stripe
 *  Checkout webhook (web) and the PaymentIntent webhook (mobile native). */
export async function fulfillTicketOrder(input: FulfillInput): Promise<FulfillResult> {
  const supabase = await createAdminClient() as any;

  const { data: dbEvent, error: eventError } = await supabase
    .from("events")
    .select("*, ticket_types(*)")
    .eq("id", input.eventId)
    .single();

  if (!dbEvent) {
    console.error("Fulfill: event not found", input.eventId, eventError?.message);
    return { ok: false, ticketsCreated: 0, emailStatus: "not_attempted", error: "Event not found" };
  }

  // Idempotency guard — never double-create for the same payment intent.
  if (input.stripePaymentIntentId) {
    const { data: existing } = await supabase
      .from("orders").select("id").eq("stripe_payment_intent_id", input.stripePaymentIntentId).maybeSingle();
    if (existing) {
      return { ok: true, orderId: existing.id, ticketsCreated: 0, emailStatus: "already_processed" };
    }
  }

  let subtotal = 0;
  for (const item of input.items) {
    const tt = dbEvent.ticket_types.find((t: any) => t.id === item.ticketTypeId);
    if (tt) {
      const price = tt.sale_enabled && tt.sale_price != null ? tt.sale_price : tt.price;
      subtotal += price * item.quantity;
    }
  }

  const { data: order, error: orderError } = await supabase.from("orders").insert({
    event_id: input.eventId,
    user_id: input.userId || null,
    guest_email: input.guestEmail || null,
    guest_name: input.guestName || null,
    stripe_checkout_session_id: input.stripeCheckoutSessionId || null,
    stripe_payment_intent_id: input.stripePaymentIntentId || null,
    subtotal,
    discount_amount: input.discountAmount,
    tax_amount: input.taxAmount,
    total: input.total,
    currency: input.currency,
    status: "PAID",
    payment_method: "ONLINE",
    promo_code_id: input.promoCodeId || null,
  }).select().single();

  if (orderError || !order) {
    console.error("Fulfill: order creation failed", orderError?.message);
    return { ok: false, ticketsCreated: 0, emailStatus: "not_attempted", error: "Order creation failed" };
  }

  const buyerEmail = input.guestEmail || input.customerEmail || null;
  const buyerName = input.guestName || input.customerName || "Guest";
  let ticketsCreated = 0;

  for (const item of input.items) {
    const tt = dbEvent.ticket_types.find((t: any) => t.id === item.ticketTypeId);
    if (!tt) continue;

    const unitPrice = tt.sale_enabled && tt.sale_price != null ? tt.sale_price : tt.price;

    const { data: orderItem } = await supabase.from("order_items").insert({
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
      event_id: input.eventId,
      ticket_type_id: item.ticketTypeId,
      ticket_name: tt.name,
      tier: tt.tier,
      status: "VALID",
      holder_name: input.guestName || input.customerName || null,
      holder_email: buyerEmail,
      qr_code: `TKT-${order.id.slice(0, 8).toUpperCase()}-${orderItem.id.slice(0, 4).toUpperCase()}-${String(i + 1).padStart(2, "0")}`,
    }));

    const { data: createdTickets, error: ticketError } = await supabase
      .from("tickets").insert(ticketInserts).select();
    if (ticketError) console.error("Fulfill: ticket insert error", JSON.stringify(ticketError));
    if (createdTickets) ticketsCreated += createdTickets.length;

    await supabase.rpc("increment_ticket_sold", {
      p_ticket_type_id: item.ticketTypeId,
      p_amount: item.quantity,
    });
  }

  // ── Invoice — real Billingo e-invoice when configured, else local number ──
  // RULE: only invoice real paid orders. Never invoice free (spin-won) tickets.
  if (input.total > 0) {
    const appSettingsForInvoice = await getSettings();
    const invoiceItems: BillingoLineItem[] = input.items
      .map((item) => {
        const tt = dbEvent.ticket_types.find((t: any) => t.id === item.ticketTypeId);
        if (!tt) return null;
        const unitPrice = tt.sale_enabled && tt.sale_price != null ? tt.sale_price : tt.price;
        return { name: `${dbEvent.name} — ${tt.name}`, unitPrice, quantity: item.quantity };
      })
      .filter((x): x is BillingoLineItem => x !== null && x.unitPrice > 0);

    // Billing details: registered buyer's profile, else guest.
    let billing: any = null;
    if (input.userId) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("billing_name, billing_address, billing_city, billing_postal_code, billing_country, name, email")
        .eq("id", input.userId)
        .single();
      billing = prof;
    }

    let billingoResult = null;
    if (invoiceItems.length > 0) {
      billingoResult = await createBillingoInvoice({
        buyer: {
          name: billing?.billing_name || buyerName,
          email: buyerEmail,
          countryCode: billing?.billing_country || "HU",
          postCode: billing?.billing_postal_code || null,
          city: billing?.billing_city || null,
          address: billing?.billing_address || null,
        },
        items: invoiceItems,
        currency: input.currency,
        language: appSettingsForInvoice.language === "hu" ? "hu" : "en",
        paid: true,
      });
    }

    await supabase.from("invoices").insert({
      order_id: order.id,
      number: billingoResult?.number ?? `INV-${Date.now()}`,
      pdf_url: billingoResult?.pdfUrl ?? null,
    });
  }

  if (input.promoCodeId) {
    await supabase.rpc("increment_promo_used", { p_promo_id: input.promoCodeId });
  }

  // Award loyalty credits to registered buyers (idempotent per order)
  if (input.userId) {
    const { data: cs } = await supabase
      .from("app_settings").select("credits_per_ticket").eq("id", "global").single();
    await supabase.rpc("award_credits", {
      p_user_id: input.userId,
      p_amount: cs?.credits_per_ticket ?? 4,
      p_reason: "TICKET_PURCHASE",
      p_order_id: order.id,
      p_drink_order_id: null,
    });
  }

  // Confirmation email
  const appSettings = await getSettings();
  let emailStatus = "skipped_no_email";
  let emailError = "";

  if (buyerEmail) {
    const { data: emailTickets } = await supabase.from("tickets").select("*, ticket_types(image_url)").eq("order_id", order.id);
    try {
      await sendTicketConfirmation({
        to: buyerEmail,
        buyerName,
        eventName: dbEvent.name,
        eventDate: dbEvent.start_date,
        eventVenue: dbEvent.venue || undefined,
        eventBannerUrl: dbEvent.banner_image_url ?? null,
        tickets: (emailTickets ?? []).map((t: any) => ({
          id: t.id,
          qrCode: t.qr_code,
          ticketName: t.ticket_name ?? "Ticket",
          tier: t.tier ?? "GENERAL",
          holderName: t.holder_name || undefined,
          imageUrl: t.ticket_types?.image_url ?? null,
        })),
        total: input.total,
        orderId: order.id,
        language: appSettings.language,
        currency: input.currency,
      });
      emailStatus = "sent";
    } catch (e: any) {
      emailStatus = "failed";
      emailError = e?.message ?? String(e);
    }
  }

  return { ok: true, orderId: order.id, ticketsCreated, emailStatus, emailError, buyerEmail };
}
