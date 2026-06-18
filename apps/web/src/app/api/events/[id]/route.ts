import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { Profile, Event } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  coverImageUrl: z.string().url().optional().nullable(),
  bannerImageUrl: z.string().url().optional().nullable(),
  homeCoverImageUrl: z.string().url().optional().nullable(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  venue: z.string().optional(),
  address: z.string().optional(),
  capacity: z.number().min(1).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED", "ARCHIVED"]).optional(),
  taxRate: z.number().min(0).max(100).optional(),
});

async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data as Profile | null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient() as any;
  const { data, error } = await supabase.from("events").select("*, ticket_types(*), check_ins(count), orders(count)").eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data as Event);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile();
  if (!profile || !["ADMIN", "EDITOR"].includes(profile.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { name, description, coverImageUrl, bannerImageUrl, homeCoverImageUrl, startDate, endDate, venue, address, capacity, status, taxRate } = parsed.data;
  const supabase = createAdminClient() as any;
  const { data, error } = await supabase.from("events").update({
    ...(name && { name }),
    ...(description !== undefined && { description }),
    ...(coverImageUrl !== undefined && { cover_image_url: coverImageUrl }),
    ...(bannerImageUrl !== undefined && { banner_image_url: bannerImageUrl }),
    ...(homeCoverImageUrl !== undefined && { home_cover_image_url: homeCoverImageUrl }),
    ...(startDate && { start_date: startDate }),
    ...(endDate !== undefined && { end_date: endDate }),
    ...(venue !== undefined && { venue }),
    ...(address !== undefined && { address }),
    ...(capacity && { capacity }),
    ...(status && { status }),
    ...(taxRate !== undefined && { tax_rate: taxRate }),
  }).eq("id", id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as Event);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile();
  if (profile?.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const supabase = createAdminClient() as any;
  const { error } = await supabase.from("events").update({ status: "ARCHIVED" }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
