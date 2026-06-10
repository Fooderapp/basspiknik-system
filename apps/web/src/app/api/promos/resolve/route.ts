import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import type { PromoCode } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Resolve a promo by id (from a scanned QR) to its discount info — WITHOUT
 *  ever returning the marketing code. The client shows "20% off" and sends the
 *  promo id back to checkout, so the code stays hidden end-to-end. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ valid: false }, { status: 400 });

  const admin = await createAdminClient() as any;
  const { data } = await admin
    .from("promo_codes")
    .select("id, event_id, discount_type, discount_value, usage_limit, used_count, expires_at")
    .eq("id", id)
    .maybeSingle();

  const promo = data as Partial<PromoCode> | null;
  if (!promo) return NextResponse.json({ valid: false });

  const exhausted = promo.usage_limit != null && (promo.used_count ?? 0) >= promo.usage_limit;
  const expired = promo.expires_at ? new Date(promo.expires_at) < new Date() : false;

  return NextResponse.json({
    valid: !exhausted && !expired,
    id: promo.id,
    eventId: promo.event_id ?? null,
    discountType: promo.discount_type,
    discountValue: promo.discount_value,
    exhausted,
    expired,
  });
}
