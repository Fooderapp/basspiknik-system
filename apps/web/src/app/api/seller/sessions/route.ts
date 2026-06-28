import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { createBillingoInvoice, type BillingoLineItem } from "@/lib/billingo";
import { sendTicketConfirmation } from "@/lib/email";
import type { Profile } from "@/lib/supabase/types";

/** POS payment method → canonical orders.payment_method enum. */
const ORDER_PM: Record<string, string> = {
  CASH: "CASH",
  CARD: "CARD_TERMINAL",
  TERMINAL: "CARD_TERMINAL",
};

/** POS payment method → Billingo payment_method enum. */
const BILLINGO_PM: Record<string, string> = {
  CASH: "cash",
  CARD: "bankcard",
  TERMINAL: "bankcard",
};

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Resolve seller profile from cookie (web) or Bearer token (mobile). */
async function getSellerProfile(req: Request): Promise<Profile | null> {
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (bearerToken) {
    // Mobile: Bearer token auth
    const sb = createSbClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data: { user }, error } = await sb.auth.getUser(bearerToken);
    if (error || !user) return null;
    const admin = createSbClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data } = await admin.from("profiles").select("*").eq("id", user.id).single();
    return data as Profile | null;
  }

  // Web: cookie auth
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data as Profile | null;
}

const createSessionSchema = z.object({
  eventId: z.string().uuid(),
  paymentMethod: z.enum(["CASH", "CARD", "TERMINAL"]),
  items: z.array(z.object({
    ticketTypeId: z.string().uuid(),
    quantity: z.number().int().min(1),
    unitPrice: z.number().min(0),
  })).min(1),
  buyerName: z.string().optional(),
  buyerEmail: z.string().email().optional().or(z.literal("")),
  /** Buyer billing address for invoice (optional — falls back to HU defaults). */
  billingName: z.string().optional(),
  billingAddress: z.string().optional(),
  billingCity: z.string().optional(),
  billingPostal: z.string().optional(),
  billingCountry: z.string().optional(),
  /** Buyer's registered user id (when scanned at POS) — links profile billing. */
  buyerUserId: z.string().uuid().optional().nullable(),
  /** Stripe PaymentIntent id for terminal payments (for idempotency + records). */
  stripePaymentIntentId: z.string().optional().nullable(),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  const profile = await getSellerProfile(req);
  if (!profile || !["ADMIN", "EDITOR", "SELLER"].includes(profile.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSessionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const {
    eventId, paymentMethod, items, buyerName, buyerEmail, notes,
    billingName, billingAddress, billingCity, billingPostal, billingCountry,
    buyerUserId, stripePaymentIntentId,
  } = parsed.data;

  const supabase = createAdminClient() as any;
  const settings = await getSettings();

  const totalAmount = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);

  // If buyer is a registered user, pull their billing profile for the invoice.
  let registeredBilling: any = null;
  if (buyerUserId) {
    const { data } = await supabase
      .from("profiles")
      .select("billing_name, billing_address, billing_city, billing_postal_code, billing_country, name, email")
      .eq("id", buyerUserId)
      .single();
    registeredBilling = data;
  }

  // Create order record
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      event_id: eventId,
      user_id: buyerUserId || profile.id,
      status: "PAID",
      payment_method: ORDER_PM[paymentMethod] ?? "CASH",
      stripe_payment_intent_id: stripePaymentIntentId || `SELLER_${Date.now()}`,
      subtotal: totalAmount,
      tax_amount: 0,
      discount_amount: 0,
      total: totalAmount,
      currency: settings.currency,
      guest_name: buyerName ?? null,
      guest_email: buyerEmail || null,
    })
    .select()
    .single();

  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 });

  // Event details — name for invoice line items, the rest for the email.
  const { data: ev } = await supabase
    .from("events")
    .select("name, start_date, venue, banner_image_url")
    .eq("id", eventId)
    .single();
  const eventName = ev?.name ?? "Event";
  const invoiceItems: BillingoLineItem[] = [];

  // Create order items + tickets
  for (const item of items) {
    const { data: tt } = await supabase
      .from("ticket_types")
      .select("name, tier, is_bundle, bundle_size, is_door_ticket")
      .eq("id", item.ticketTypeId)
      .single();

    if (item.unitPrice > 0) {
      // For bundles: expand to individual tickets on the invoice.
      const bundleSize = (tt?.is_bundle && tt?.bundle_size) ? tt.bundle_size : 1;
      const invoiceQty = item.quantity * bundleSize;
      const invoiceUnit = bundleSize > 1 ? Math.round(item.unitPrice / bundleSize) : item.unitPrice;
      invoiceItems.push({ name: `${eventName} — ${tt?.name ?? "Ticket"}`, unitPrice: invoiceUnit, quantity: invoiceQty });
    }

    const { data: orderItem, error: itemErr } = await supabase
      .from("order_items")
      .insert({
        order_id: order.id,
        ticket_type_id: item.ticketTypeId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total: item.unitPrice * item.quantity,
      })
      .select()
      .single();

    if (itemErr) continue;

    const ticketsToCreate = item.quantity * (tt?.is_bundle && tt?.bundle_size ? tt.bundle_size : 1);
    const isDoor = !!tt?.is_door_ticket;

    for (let i = 0; i < ticketsToCreate; i++) {
      const qrCode = `TKT-${order.id.slice(0, 8)}-${orderItem.id.slice(0, 8)}-${String(i).padStart(2, "0")}`;
      const { data: ticket } = await supabase.from("tickets").insert({
        order_id: order.id,
        order_item_id: orderItem.id,
        event_id: eventId,
        ticket_type_id: item.ticketTypeId,
        ticket_name: tt?.name ?? "Ticket",
        tier: tt?.tier ?? "GENERAL",
        qr_code: qrCode,
        holder_name: buyerName ?? null,
        holder_email: buyerEmail || null,
        status: isDoor ? "USED" : "VALID",
        used_at: isDoor ? new Date().toISOString() : null,
      }).select("id").single();

      if (isDoor && ticket?.id) {
        await supabase.from("check_ins").insert({
          ticket_id: ticket.id,
          event_id: eventId,
          checked_in_by: profile.id,
        });
      }
    }

    await supabase.rpc("increment_ticket_sold", {
      p_ticket_type_id: item.ticketTypeId,
      p_amount: item.quantity,
    });
  }

  // Log seller session
  await supabase.from("seller_sessions").insert({
    seller_id: profile.id,
    event_id: eventId,
    total_sold: totalQty,
    total_revenue: totalAmount,
    payment_method: paymentMethod,
    notes: notes ?? null,
  });

  // ── Invoice ──────────────────────────────────────────────────────────────────
  let invoiceNumber: string | null = null;
  const { data: invSetting } = await supabase
    .from("app_settings").select("invoice_pos_cash").eq("id", "global").single();
  const cashInvoicingOn = invSetting?.invoice_pos_cash ?? true;
  const skipCash = paymentMethod === "CASH" && !cashInvoicingOn;

  if (totalAmount > 0 && invoiceItems.length > 0 && !skipCash) {
    // Resolve billing details: explicit fields > registered profile > defaults
    const effectiveBillingName =
      billingName || registeredBilling?.billing_name || buyerName || "Vásárló";
    const effectiveBillingEmail =
      buyerEmail || registeredBilling?.email || null;
    const effectiveCountry =
      billingCountry || registeredBilling?.billing_country || "HU";
    const effectiveAddress =
      billingAddress || registeredBilling?.billing_address || null;
    const effectiveCity =
      billingCity || registeredBilling?.billing_city || null;
    const effectivePostal =
      billingPostal || registeredBilling?.billing_postal_code || null;

    let billingoResult = null;
    try {
      billingoResult = await createBillingoInvoice({
        buyer: {
          name: effectiveBillingName,
          email: effectiveBillingEmail,
          countryCode: effectiveCountry,
          address: effectiveAddress,
          city: effectiveCity,
          postCode: effectivePostal,
        },
        items: invoiceItems,
        currency: settings.currency,
        language: settings.language === "hu" ? "hu" : "en",
        paid: true,
        paymentMethod: BILLINGO_PM[paymentMethod] ?? "cash",
      });
    } catch { /* fall through to local number */ }

    invoiceNumber = billingoResult?.number ?? `INV-${Date.now()}`;
    await supabase.from("invoices").insert({
      order_id: order.id,
      number: invoiceNumber,
      pdf_url: billingoResult?.pdfUrl ?? null,
    });
  }

  // Tickets just created — used for the web receipt QR and the email.
  const { data: createdTickets } = await supabase
    .from("tickets")
    .select("qr_code, ticket_name, tier, holder_name, ticket_types(image_url)")
    .eq("order_id", order.id);
  const ticketQrs: string[] = (createdTickets ?? []).map((t: any) => t.qr_code);

  // Confirmation email. The Stripe webhook sends it for ONLINE orders; POS sales
  // bypass the webhook, so send it here. Only for WEB callers (cookie, no Bearer)
  // — the mobile app already triggers its own send-confirmation, so this avoids a
  // double email without touching the app.
  const usedBearer = !!req.headers.get("authorization")?.startsWith("Bearer ");
  if (!usedBearer && buyerEmail && (createdTickets?.length ?? 0) > 0 && ev) {
    try {
      await sendTicketConfirmation({
        to: buyerEmail,
        buyerName: buyerName || "Guest",
        eventName: ev.name,
        eventDate: ev.start_date,
        eventVenue: ev.venue ?? undefined,
        eventBannerUrl: ev.banner_image_url ?? null,
        tickets: (createdTickets ?? []).map((t: any) => ({
          id: t.qr_code,
          qrCode: t.qr_code,
          ticketName: t.ticket_name ?? "Ticket",
          tier: t.tier ?? "GENERAL",
          holderName: t.holder_name || undefined,
          imageUrl: t.ticket_types?.image_url ?? null,
        })),
        total: totalAmount,
        orderId: order.id,
        language: settings.language,
        currency: settings.currency,
      });
    } catch { /* email failure must not fail the sale */ }
  }

  return NextResponse.json({ orderId: order.id, totalAmount, totalQty, invoiceNumber, ticketQrs }, { status: 201 });
}

export async function GET(req: Request) {
  const profile = await getSellerProfile(req);
  if (!profile || !["ADMIN", "EDITOR", "SELLER"].includes(profile.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");

  const supabase = createAdminClient() as any;
  let query = supabase
    .from("seller_sessions")
    .select("*, events(name), profiles(name, email)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (eventId) query = query.eq("event_id", eventId);
  if (profile.role === "SELLER") query = query.eq("seller_id", profile.id);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
