import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function getAuth(): Promise<{ user: any; profile: Profile | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null };
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return { user, profile: data as Profile | null };
}

const isStaff = (p: Profile | null) =>
  !!p && ["ADMIN", "EDITOR", "STAFF", "BARTENDER"].includes(p.role);

// ─── GET  (fetch single order — staff or token owner) ─────────────────────────
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  const supabase = await createClient() as any;
  const { data, error } = await supabase
    .from("drink_orders")
    .select("*, drink_order_items(*, drinks(name, category))")
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { profile } = await getAuth();
  if (!isStaff(profile) && data.qr_token !== token) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(data);
}

// ─── PATCH  (update status and/or item fulfilment) ────────────────────────────
const itemUpdateSchema = z.object({
  id: z.string().uuid(),
  fulfilled: z.boolean().optional(),
  quantity: z.coerce.number().int().min(0).optional(),
});

const patchSchema = z.object({
  status: z.enum(["PENDING", "IN_PROGRESS", "FULFILLED", "CANCELLED"]).optional(),
  items: z.array(itemUpdateSchema).optional(),
  // User editing their own order (PENDING only)
  guestName: z.string().max(80).optional().nullable(),
  notes: z.string().max(400).optional().nullable(),
  orderItems: z.array(z.object({
    drinkId: z.string().uuid(),
    quantity: z.coerce.number().int().min(1).max(20),
    notes: z.string().max(200).optional().nullable(),
  })).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, profile } = await getAuth();

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const adminSupabase = await createAdminClient() as any;

  // Fetch the order
  const { data: order } = await adminSupabase
    .from("drink_orders")
    .select("*, drink_order_items(*)")
    .eq("id", id)
    .single();

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  // Permission check
  const ownsOrder = user && order.user_id === user.id;
  if (!isStaff(profile) && !ownsOrder) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { status, items, guestName, notes, orderItems } = parsed.data;

  // ── Staff: update status ──
  if (status && isStaff(profile)) {
    const { data, error } = await adminSupabase
      .from("drink_orders")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*, drink_order_items(*, drinks(name, category))")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // If status update is the only thing, return early
    if (!items) return NextResponse.json(data);
  }

  // ── Staff: toggle individual item fulfilment / quantity ──
  if (items && isStaff(profile)) {
    for (const item of items) {
      if (item.quantity !== undefined && item.quantity === 0) {
        // quantity 0 = remove item
        await adminSupabase.from("drink_order_items").delete().eq("id", item.id);
      } else {
        const updates: Record<string, any> = {};
        if (item.fulfilled !== undefined) {
          updates.fulfilled_at = item.fulfilled ? new Date().toISOString() : null;
        }
        if (item.quantity !== undefined && item.quantity > 0) {
          updates.quantity = item.quantity;
        }
        if (Object.keys(updates).length > 0) {
          await adminSupabase.from("drink_order_items").update(updates).eq("id", item.id);
        }
      }
    }

    // Re-fetch and return updated order
    const { data: updated } = await adminSupabase
      .from("drink_orders")
      .select("*, drink_order_items(*, drinks(name, category))")
      .eq("id", id)
      .single();
    return NextResponse.json(updated);
  }

  // ── User editing their own PENDING order ──
  if (ownsOrder && order.status === "PENDING" && (guestName !== undefined || notes !== undefined || orderItems)) {
    const orderUpdate: Record<string, any> = { updated_at: new Date().toISOString() };
    if (guestName !== undefined) orderUpdate.guest_name = guestName;
    if (notes !== undefined) orderUpdate.notes = notes;

    if (orderItems) {
      // Re-calculate total from new items
      const drinkIds = orderItems.map((i) => i.drinkId);
      const supabase = await createClient() as any;
      const { data: drinks } = await supabase.from("drinks").select("id,price,sale_enabled,sale_price").in("id", drinkIds);
      const drinkMap = new Map((drinks ?? []).map((d: any) => [d.id, d]));
      const itemsWithPrice = orderItems.map((item) => {
        const d = drinkMap.get(item.drinkId) as any;
        const unitPrice = d?.sale_enabled && d?.sale_price ? d.sale_price : (d?.price ?? 0);
        return { ...item, unitPrice };
      });
      const newTotal = itemsWithPrice.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
      orderUpdate.total = newTotal;

      // Replace all items
      await adminSupabase.from("drink_order_items").delete().eq("drink_order_id", id);
      await adminSupabase.from("drink_order_items").insert(
        itemsWithPrice.map((i) => ({
          drink_order_id: id,
          drink_id: i.drinkId,
          quantity: i.quantity,
          unit_price: i.unitPrice,
          notes: i.notes ?? null,
        }))
      );
    }

    await adminSupabase.from("drink_orders").update(orderUpdate).eq("id", id);
    const { data: updated } = await adminSupabase
      .from("drink_orders")
      .select("*, drink_order_items(*, drinks(name, category))")
      .eq("id", id)
      .single();
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "No valid updates" }, { status: 400 });
}

// ─── DELETE  (user cancels their own PENDING order, or staff) ─────────────────
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, profile } = await getAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminSupabase = await createAdminClient() as any;
  const { data: order } = await adminSupabase.from("drink_orders").select("user_id, status").eq("id", id).single();
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ownsOrder = order.user_id === user.id;
  if (!isStaff(profile) && !ownsOrder) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isStaff(profile) && order.status !== "PENDING") {
    return NextResponse.json({ error: "Cannot cancel an order that is already being processed" }, { status: 409 });
  }

  // Soft-cancel instead of hard delete (keeps history)
  await adminSupabase
    .from("drink_orders")
    .update({ status: "CANCELLED", updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}
