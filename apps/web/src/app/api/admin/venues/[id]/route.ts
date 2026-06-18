import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  maps_url: z.string().max(1000).optional(),
  description_hu: z.string().max(5000).optional(),
  description_en: z.string().max(5000).optional(),
  images: z.array(z.string()).optional(),
  active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  event_id: z.string().uuid().optional().nullable(),
});

async function requireEditor() {
  const p = await getCurrentProfile();
  return p && ["ADMIN", "EDITOR"].includes(p.role) ? p : null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireEditor())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const admin = createAdminClient() as any;
  const { data, error } = await admin.from("map_venues").update(parsed.data).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ venue: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireEditor())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const admin = createAdminClient() as any;
  const { error } = await admin.from("map_venues").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
