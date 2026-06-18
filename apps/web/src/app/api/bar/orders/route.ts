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

// ─── GET  (bartender queue -or- scanner token lookup) ─────────────────────────
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  // Scanner lookup by QR token — no auth, token acts as the secret
  if (token) {
    const supabase = await createClient() as any;
    const { data, error } = await supabase
      .from("drink_orders")
      .select("*, drink_order_items(*, drinks(name, category))")
      .eq("qr_token", token)
      .single();
    if (error || !data) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json(data);
  }

  // Full queue — bartender/staff/admin only
  const profile = await getProfile();
  if (!profile || !["ADMIN", "EDITOR", "STAFF", "BARTENDER"].includes(profile.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const statusFilter = searchParams.get("status");
  const supabase = await createClient() as any;
  let query = supabase
    .from("drink_orders")
    .select("*, drink_order_items(*, drinks(name, category))")
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: true });

  if (statusFilter) {
    query = query.in("status", statusFilter.split(","));
  } else {
    query = query.in("status", ["PENDING", "IN_PROGRESS"]);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// ─── POST  (public: create a new drink order) ─────────────────────────────────
const itemSchema = z.object({
  drinkId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(20),
  notes: z.string().max(200).optional().nullable(),
});

const orderSchema = z.object({
  guestName: z.string().max(80).optional().nullable(),
  notes: z.string().max(400).optional().nullable(),
  eventId: z.string().uuid().optional().nullable(),
  items: z.array(itemSchema).min(1).max(20),
  freeSpinToken: z.string().optional(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { guestName, notes, eventId, items, freeSpinToken } = parsed.data;

  const supabase = await createClient() as any;
  const drinkIds = items.map((i) => i.drinkId);
  const { data: drinks, error: drinksError } = await supabase
    .from("drinks")
    .select("id, price, sale_enabled, sale_price, available, name")
    .in("id", drinkIds);

  if (drinksError) return NextResponse.json({ error: drinksError.message }, { status: 500 });

  const drinkMap = new Map((drinks ?? []).map((d: any) => [d.id, d]));

  for (const item of items) {
    const drink = drinkMap.get(item.drinkId) as any;
    if (!drink) return NextResponse.json({ error: `Drink ${item.drinkId} not found` }, { status: 400 });
    if (!drink.available) return NextResponse.json({ error: `"${drink.name}" is currently unavailable` }, { status: 400 });
  }

  const adminSupabase = createAdminClient() as any;
  let isVip = false;
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (user) {
    const { data: profile } = await adminSupabase.from("profiles").select("role").eq("id", user.id).single();
    isVip = profile?.role === "VIP_GUEST";
  }

  const orderItems = items.map((item) => {
    const drink = drinkMap.get(item.drinkId) as any;
    const unitPrice = drink.sale_enabled && drink.sale_price ? drink.sale_price : drink.price;
    return { drinkId: item.drinkId, quantity: item.quantity, unitPrice, notes: item.notes ?? null };
  });

  let total = orderItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  // Free drink via a winning spin token (single-use, must own + match context)
  let freeSpin = false;
  if (freeSpinToken) {
    if (!user) return NextResponse.json({ error: "Sign in to claim a free spin" }, { status: 401 });
    const userClient = await createClient() as any;
    const { data: redeem } = await userClient.rpc("redeem_spin_token", {
      p_token: freeSpinToken,
      p_context: "DRINK",
    });
    if (!redeem?.ok) return NextResponse.json({ error: "Invalid or expired spin token" }, { status: 400 });
    total = 0;
    freeSpin = true;
  }

  const qrExpiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

  const { data: order, error: orderError } = await adminSupabase
    .from("drink_orders")
    .insert({
      user_id: user?.id ?? null,
      guest_name: guestName ?? null,
      notes: notes ?? null,
      event_id: eventId ?? null,
      status: "PENDING",
      is_vip: isVip,
      paid_online: freeSpin,
      total,
      qr_expires_at: qrExpiresAt,
    })
    .select()
    .single();

  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });

  if (freeSpin) {
    await adminSupabase.from("spin_wins").update({ used_order_id: order.id }).eq("token", freeSpinToken);
  }

  const { error: itemsError } = await adminSupabase
    .from("drink_order_items")
    .insert(
      orderItems.map((i) => ({
        drink_order_id: order.id,
        drink_id: i.drinkId,
        quantity: i.quantity,
        unit_price: i.unitPrice,
        notes: i.notes,
      }))
    );

  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });

  return NextResponse.json({ id: order.id, qrToken: order.qr_token, total }, { status: 201 });
}
