import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { Profile, TicketType } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ticketTypeSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  price: z.number().min(0),
  quantity: z.number().min(1),
  tier: z.enum(["EARLY_BIRD", "GENERAL", "LATE", "DOOR", "VIP", "FREE"]).default("GENERAL"),
  maxPerOrder: z.number().min(1).default(10),
  entriesPerTicket: z.number().int().min(1).default(1),
  saleStartsAt: z.string().optional().nullable(),
  saleEndsAt: z.string().optional().nullable(),
  isBundle: z.boolean().default(false),
  bundleSize: z.number().int().min(2).optional().nullable(),
  isDoorTicket: z.boolean().default(false),
  saleEnabled: z.boolean().default(false),
  salePrice: z.number().min(0).optional().nullable(),
  isVisible: z.boolean().default(true),
  visibleFrom: z.string().optional().nullable(),
  visibleUntil: z.string().optional().nullable(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient() as any;
  const { data, error } = await supabase.from("ticket_types").select("*").eq("event_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as TicketType[]);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profileData } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const profile = profileData as Pick<Profile, "role"> | null;
  if (!profile || !["ADMIN", "EDITOR"].includes(profile.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = ticketTypeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const admin = createAdminClient() as any;
  const d = parsed.data;
  const { data, error } = await admin.from("ticket_types").insert({
    event_id: id,
    name: d.name,
    description: d.description ?? null,
    image_url: d.imageUrl ?? null,
    price: d.price,
    quantity: d.quantity,
    tier: d.tier,
    max_per_order: d.maxPerOrder,
    entries_per_ticket: d.entriesPerTicket,
    sale_starts_at: d.saleStartsAt ?? null,
    sale_ends_at: d.saleEndsAt ?? null,
    is_bundle: d.isBundle,
    bundle_size: d.bundleSize ?? null,
    is_door_ticket: d.isDoorTicket,
    sale_enabled: d.saleEnabled,
    sale_price: d.saleEnabled ? (d.salePrice ?? null) : null,
    is_visible: d.isVisible,
    visible_from: d.visibleFrom || null,
    visible_until: d.visibleUntil || null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as TicketType, { status: 201 });
}
