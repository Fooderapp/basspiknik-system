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

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  category: z.enum(["COCKTAIL","BEER","WINE","SPIRIT","SOFT_DRINK","SHOT","OTHER"]).optional(),
  price: z.coerce.number().min(0).optional(),
  available: z.boolean().optional(),
  saleEnabled: z.boolean().optional(),
  salePrice: z.coerce.number().min(0).optional().nullable(),
  isPopular: z.boolean().optional(),
  allergens: z.array(z.string()).optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile();
  if (!profile || !["ADMIN", "EDITOR", "STAFF", "BARTENDER"].includes(profile.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;
  const supabase = await createAdminClient() as any;
  const { data, error } = await supabase.from("drinks").update({
    ...(d.name !== undefined && { name: d.name }),
    ...(d.description !== undefined && { description: d.description }),
    ...(d.category !== undefined && { category: d.category }),
    ...(d.price !== undefined && { price: d.price }),
    ...(d.available !== undefined && { available: d.available }),
    ...(d.saleEnabled !== undefined && { sale_enabled: d.saleEnabled }),
    ...(d.salePrice !== undefined && { sale_price: d.salePrice }),
    ...(d.isPopular !== undefined && { is_popular: d.isPopular }),
    ...(d.allergens !== undefined && { allergens: d.allergens }),
    ...(d.sortOrder !== undefined && { sort_order: d.sortOrder }),
  }).eq("id", id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as Drink);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile();
  if (!profile || !["ADMIN", "EDITOR"].includes(profile.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const supabase = await createAdminClient() as any;
  const { error } = await supabase.from("drinks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
