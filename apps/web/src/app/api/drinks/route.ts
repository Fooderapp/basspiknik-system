import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { Profile, Drink } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data as Profile | null;
}

const drinkSchema = z.object({
  name:        z.string().min(1),
  description: z.string().optional().nullable(),
  categoryId:  z.string().uuid(),
  price:       z.coerce.number().min(0),
  available:   z.boolean().default(true),
  saleEnabled: z.boolean().default(false),
  salePrice:   z.coerce.number().min(0).optional().nullable(),
  isPopular:   z.boolean().default(false),
  allergens:   z.array(z.string()).default([]),
  sortOrder:   z.coerce.number().int().default(0),
});

export async function GET() {
  const supabase = await createClient() as any;
  const { data, error } = await supabase.from("drinks").select("*").order("sort_order").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as Drink[]);
}

export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile || !["ADMIN", "EDITOR"].includes(profile.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = drinkSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;
  const supabase = await createAdminClient() as any;
  const { data, error } = await supabase.from("drinks").insert({
    name:        d.name,
    description: d.description ?? null,
    category:    "OTHER",          // legacy column; category_id is authoritative
    category_id: d.categoryId,
    price:       d.price,
    available:   d.available,
    sale_enabled: d.saleEnabled,
    sale_price:  d.saleEnabled ? (d.salePrice ?? null) : null,
    is_popular:  d.isPopular,
    allergens:   d.allergens,
    sort_order:  d.sortOrder,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as Drink, { status: 201 });
}
