import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function getProfile(): Promise<Profile | null> {
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
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile || !["ADMIN", "EDITOR", "SELLER"].includes(profile.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSessionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { eventId, paymentMethod, items, buyerName, buyerEmail, notes } = parsed.data;
  const supabase = await createAdminClient() as any;

  const totalAmount = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);

  // Create order record
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      event_id: eventId,
      user_id: profile.id,
      status: "COMPLETED",
      payment_method: paymentMethod,
      stripe_payment_intent_id: `SELLER_${Date.now()}`,
      subtotal: totalAmount,
      tax_amount: 0,
      discount_amount: 0,
      total: totalAmount,
      currency: "eur",
      guest_name: buyerName ?? null,
      guest_email: buyerEmail || null,
    })
    .select()
    .single();

  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 });

  // Create order items + tickets
  for (const item of items) {
    const { data: tt } = await supabase
      .from("ticket_types")
      .select("name, tier")
      .eq("id", item.ticketTypeId)
      .single();

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

    // Create individual ticket records
    for (let i = 0; i < item.quantity; i++) {
      const qrCode = `TKT-${order.id.slice(0, 8)}-${orderItem.id.slice(0, 8)}-${i}`;
      await supabase.from("tickets").insert({
        order_id: order.id,
        order_item_id: orderItem.id,
        event_id: eventId,
        ticket_type_id: item.ticketTypeId,
        ticket_name: tt?.name ?? "Ticket",
        tier: tt?.tier ?? "GENERAL",
        qr_code: qrCode,
        holder_name: buyerName ?? null,
        holder_email: buyerEmail || null,
      });
    }

    // Increment sold count
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

  return NextResponse.json({ orderId: order.id, totalAmount, totalQty }, { status: 201 });
}

export async function GET(req: Request) {
  const profile = await getProfile();
  if (!profile || !["ADMIN", "EDITOR", "SELLER"].includes(profile.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");

  const supabase = await createAdminClient() as any;
  let query = supabase
    .from("seller_sessions")
    .select("*, events(name), profiles(name, email)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (eventId) query = query.eq("event_id", eventId);
  // Non-admin sellers see only their own sessions
  if (profile.role === "SELLER") query = query.eq("seller_id", profile.id);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
