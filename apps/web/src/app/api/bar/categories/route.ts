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

const schema = z.object({
  name:      z.string().min(1).max(60),
  name_hu:   z.string().max(60).optional().nullable(),
  emoji:     z.string().max(8).default("🍹"),
  color:     z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#374151"),
  sort_order: z.coerce.number().int().default(0),
});

export async function GET() {
  const supabase = await createClient() as any;
  const { data, error } = await supabase
    .from("drink_categories")
    .select("*")
    .order("sort_order")
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile || !["ADMIN", "EDITOR"].includes(profile.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = await createAdminClient() as any;
  const { data, error } = await supabase.from("drink_categories").insert(parsed.data).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
