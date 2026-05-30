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

// ─── GET  (bartender/staff/admin: list active orders) ─────────────────────────
export async function GET(req: Request) {
  const profile = await getProfile();
  if (!profile || !["ADMIN", "EDITOR", "STAFF", "BARTENDER"].includes(profile.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status"); // optional, e.g. "PENDING,IN_PROGRESS"

  const supabase = await createClient() as any;
  let query = supabase
    .from("drink_orders")
    .select("*, drink_order_items(*, drinks(name, category))")
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: true });

  if (statusFilter) {
    const statuses = statusFilter.split(",");
    query = query.in("status", statuses);
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
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { guestName, notes, eventId, items } = parsed.data;

  // Look up drink prices (public read)
  const supabase = await createClient() as any;
  const drinkIds = items.map((i) => i.drinkId);
  const { data: drinks, error: drinksError } = await supabase
    .from("drinks")
    .select("id, price, sale_enabled, sale_price, available, name")
    .in("id", drinkIds);

  if (drinksError) return NextResponse.json({ error: drinksError.message }, { status: 500 });

  const drinkMap = new Map((drinks ?? []).map((d: any) => [d.id, d]));

  // Validate all drinks exist and are available
  for (const item of items) {
    const drink = drinkMap.get(item.drinkId) as any;
    if (!drink) return NextResponse.json({ error: `Drink ${item.drinkId} not found` }, { status: 400 });
    if (!drink.available) return NextResponse.json({ error: `"${drink.name}" is currently unavailable` }, { status: 400 });
  }

  // Check if user is VIP
  const adminSupabase = await createAdminClient() as any;
  let isVip = false;
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (user) {
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    isVip = profile?.role === "VIP_GUEST";
  }

  // Calculate total
  const orderItems = items.map((item) => {
    const drink = drinkMap.get(item.drinkId) as any;
    const unitPrice = drink.sale_enabled && drink.sale_price ? drink.sale_price : drink.price;
    return { drinkId: item.drinkId, quantity: item.quantity, unitPrice, notes: item.notes ?? null };
  });

  const total = orderItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  // QR expiry: 4 hours from now
  const qrExpiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

  // Insert order
  const { data: order, error: orderError } = await adminSupabase
    .from("drink_orders")
    .insert({
      user_id: user?.id ?? null,
      guest_name: guestName ?? null,
      notes: notes ?? null,
      event_id: eventId ?? null,
      status: "PENDING",
      is_vip: isVip,
      paid_online: false,
      total,
      qr_expires_at: qrExpiresAt,
    })
    .select()
    .single();

  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });

  // Insert items
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
