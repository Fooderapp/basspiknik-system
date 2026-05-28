import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { sendTicketConfirmation } from "@/lib/email";

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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const meta = session.metadata ?? {};
    const items: Array<{ ticketTypeId: string; quantity: number }> = JSON.parse(meta.items ?? "[]");
    const supabase = await createAdminClient() as any;

    const { data: dbEvent, error: eventError } = await supabase
      .from("events")
      .select("*, ticket_types(*)")
      .eq("id", meta.eventId)
      .single();
    if (!dbEvent) {
      console.error("Event not found. eventId:", meta.eventId, "supabaseError:", eventError);
      return NextResponse.json({ error: "Event not found", eventId: meta.eventId, supabaseError: eventError?.message }, { status: 404 });
    }

    let subtotal = 0;
    for (const item of items) {
      const tt = dbEvent.ticket_types.find((t: any) => t.id === item.ticketTypeId);
      if (tt) {
        const price = tt.sale_enabled && tt.sale_price != null ? tt.sale_price : tt.price;
        subtotal += price * item.quantity;
      }
    }

    const { data: order, error: orderError } = await supabase.from("orders").insert({
      event_id: meta.eventId,
      user_id: meta.userId || null,
      guest_email: meta.guestEmail || null,
      guest_name: meta.guestName || null,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
      subtotal,
      discount_amount: parseFloat(meta.discountAmount ?? "0"),
      tax_amount: parseFloat(meta.taxAmount ?? "0"),
      total: (session.amount_total ?? 0) / 100,
      status: "PAID",
      payment_method: "ONLINE",
      promo_code_id: meta.promoCodeId || null,
    }).select().single();

    if (orderError || !order) return NextResponse.json({ error: "Order creation failed" }, { status: 500 });

    const allTickets: any[] = [];

    for (const item of items) {
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

      // How many QR codes to generate:
      // - bundle: item.quantity * bundle_size individual tickets
      // - normal: item.quantity tickets
      const ticketsPerUnit = tt.is_bundle && tt.bundle_size ? tt.bundle_size : 1;
      const totalTickets = item.quantity * ticketsPerUnit;

      // Resolve buyer email: guest checkout uses meta.guestEmail, logged-in uses session.customer_email
      const resolvedEmail = meta.guestEmail || session.customer_email || null;

      const ticketInserts = Array.from({ length: totalTickets }, (_, i) => ({
        order_id: order.id,
        order_item_id: orderItem.id,
        event_id: meta.eventId,
        ticket_type_id: item.ticketTypeId,
        ticket_name: tt.name,
        tier: tt.tier,
        status: "VALID",
        holder_name: meta.guestName || null,
        holder_email: resolvedEmail,
        // qr_code has a DB default (uuid), but we set a readable one
        qr_code: `TKT-${order.id.slice(0,8).toUpperCase()}-${orderItem.id.slice(0,4).toUpperCase()}-${String(i+1).padStart(2,"0")}`,
      }));

      const { data: createdTickets } = await supabase
        .from("tickets")
        .insert(ticketInserts)
        .select();

      if (createdTickets) allTickets.push(...createdTickets);

      await supabase.rpc("increment_ticket_sold", {
        p_ticket_type_id: item.ticketTypeId,
        p_amount: item.quantity,
      });
    }

    await supabase.from("invoices").insert({
      order_id: order.id,
      number: `INV-${Date.now()}`,
    });

    if (meta.promoCodeId) {
      await supabase.rpc("increment_promo_used", { p_promo_id: meta.promoCodeId });
    }

    // Send confirmation email
    // meta.guestEmail is empty for logged-in users — fall back to session.customer_email
    const buyerEmail = meta.guestEmail || session.customer_email || null;
    console.log("Email debug — buyerEmail:", buyerEmail, "tickets:", allTickets.length, "BREVO_SMTP_USER:", process.env.BREVO_SMTP_USER ? "set" : "MISSING", "BREVO_SMTP_KEY:", process.env.BREVO_SMTP_KEY ? "set" : "MISSING");
    if (buyerEmail && allTickets.length > 0) {
      try {
        await sendTicketConfirmation({
          to: buyerEmail,
          buyerName: meta.guestName || "Guest",
          eventName: dbEvent.name,
          eventDate: dbEvent.start_date,
          eventVenue: dbEvent.venue || undefined,
          tickets: allTickets.map((t: any) => ({
            id: t.id,
            qrCode: t.qr_code,
            ticketName: t.ticket_name ?? "Ticket",
            tier: t.tier,
            holderName: t.holder_name || undefined,
          })),
          total: (session.amount_total ?? 0) / 100,
          orderId: order.id,
        });
        console.log("Email sent successfully to:", buyerEmail);
      } catch (emailErr) {
        // Non-fatal — log but don't fail the webhook
        console.error("Email send failed:", JSON.stringify(emailErr, Object.getOwnPropertyNames(emailErr)));
      }
    } else {
      console.log("Email skipped — buyerEmail:", buyerEmail, "tickets:", allTickets.length);
    }
  }

  return NextResponse.json({ received: true });
}
