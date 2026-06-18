import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { Profile, PromoCode } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data as Profile | null;
}

const createSchema = z.object({
  code: z.string().min(2).max(32).transform((s) => s.toUpperCase().replace(/\s+/g, "")),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.number().min(0.01),
  usageLimit: z.number().int().min(1).optional().nullable(),
  expiresAt: z.string().optional().nullable(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile();
  if (!profile || !["ADMIN", "EDITOR"].includes(profile.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const supabase = createAdminClient() as any;
  const { data, error } = await supabase
    .from("promo_codes")
    .select("*")
    .eq("event_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as PromoCode[]);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile();
  if (!profile || !["ADMIN", "EDITOR"].includes(profile.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = createAdminClient() as any;

  // Check uniqueness
  const { data: existing } = await supabase
    .from("promo_codes")
    .select("id")
    .eq("code", parsed.data.code)
    .maybeSingle();
  if (existing) return NextResponse.json({ error: "Promo code already exists" }, { status: 409 });

  const { data, error } = await supabase.from("promo_codes").insert({
    event_id: id,
    code: parsed.data.code,
    discount_type: parsed.data.discountType,
    discount_value: parsed.data.discountValue,
    usage_limit: parsed.data.usageLimit ?? null,
    expires_at: parsed.data.expiresAt ?? null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as PromoCode, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await params;
  const profile = await getProfile();
  if (!profile || profile.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { promoId } = await req.json();
  const supabase = createAdminClient() as any;
  const { error } = await supabase.from("promo_codes").delete().eq("id", promoId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
