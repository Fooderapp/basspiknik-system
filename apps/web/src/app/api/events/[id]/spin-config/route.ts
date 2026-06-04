import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

const schema = z.object({
  enabled: z.boolean(),
  allowedTicketTypeIds: z.array(z.string().uuid()).default([]),
  minCartItems: z.coerce.number().int().min(0).max(1000).default(0),
  requireBundle: z.boolean().default(false),
  minBundles: z.coerce.number().int().min(0).max(1000).default(0),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile || !["ADMIN", "EDITOR"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = await createAdminClient() as any;
  const { data } = await supabase.from("event_spin_config").select("*").eq("event_id", id).single();
  return NextResponse.json(data ?? {
    event_id: id, enabled: false, allowed_ticket_type_ids: [],
    min_cart_items: 0, require_bundle: false, min_bundles: 0,
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile || !["ADMIN", "EDITOR"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;
  const supabase = await createAdminClient() as any;
  const { error } = await supabase.from("event_spin_config").upsert({
    event_id: id,
    enabled: d.enabled,
    allowed_ticket_type_ids: d.allowedTicketTypeIds,
    min_cart_items: d.minCartItems,
    require_bundle: d.requireBundle,
    min_bundles: d.minBundles,
    updated_at: new Date().toISOString(),
  }, { onConflict: "event_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
